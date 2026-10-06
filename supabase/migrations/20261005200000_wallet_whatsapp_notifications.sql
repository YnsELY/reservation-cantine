-- Receipt creation is part of the committed checkout. Network delivery is separate.
-- Disabled until the WhatsApp Business account, templates and worker are configured.
BEGIN;

CREATE TABLE public.whatsapp_notification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  delivery_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.whatsapp_notification_settings(id) VALUES(true);
ALTER TABLE public.whatsapp_notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_notification_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_notification_settings TO service_role;

CREATE TABLE public.whatsapp_preferences (
  user_id uuid NOT NULL,
  recipient_role text NOT NULL CHECK(recipient_role IN ('parent','provider')),
  phone text CHECK(phone ~ '^\+[1-9][0-9]{7,14}$'),
  enabled boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, recipient_role),
  CHECK(NOT enabled OR (phone IS NOT NULL AND consent_at IS NOT NULL))
);
ALTER TABLE public.whatsapp_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_preferences FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_preferences TO service_role;

CREATE FUNCTION public.get_whatsapp_preferences(p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prefs public.whatsapp_preferences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_role NOT IN ('parent','provider') OR p_role IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;
  IF (p_role='parent' AND NOT EXISTS(SELECT 1 FROM public.parents WHERE user_id=auth.uid())) OR
     (p_role='provider' AND NOT EXISTS(SELECT 1 FROM public.providers WHERE user_id=auth.uid() AND is_active)) THEN
    RAISE EXCEPTION 'Compte introuvable';
  END IF;
  SELECT * INTO prefs FROM public.whatsapp_preferences WHERE user_id=auth.uid() AND recipient_role=p_role;
  RETURN jsonb_build_object('phone',prefs.phone,'enabled',coalesce(prefs.enabled,false),
    'delivery_available',coalesce((SELECT delivery_enabled FROM public.whatsapp_notification_settings WHERE id),false));
END;
$$;

CREATE FUNCTION public.set_whatsapp_preferences(p_role text, p_phone text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.get_whatsapp_preferences(p_role);
  IF p_enabled IS NULL OR (p_enabled AND p_phone IS NULL) OR
    (p_phone IS NOT NULL AND p_phone !~ '^\+[1-9][0-9]{7,14}$') THEN
    RAISE EXCEPTION 'Numéro WhatsApp invalide';
  END IF;
  INSERT INTO public.whatsapp_preferences(user_id,recipient_role,phone,enabled,consent_at)
  VALUES(auth.uid(),p_role,p_phone,p_enabled,CASE WHEN p_enabled THEN now() END)
  ON CONFLICT(user_id,recipient_role) DO UPDATE SET phone=EXCLUDED.phone,enabled=EXCLUDED.enabled,
    consent_at=CASE WHEN EXCLUDED.enabled THEN
      CASE WHEN whatsapp_preferences.enabled AND whatsapp_preferences.phone=EXCLUDED.phone THEN whatsapp_preferences.consent_at ELSE now() END
      ELSE NULL END,updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.get_whatsapp_preferences(text), public.set_whatsapp_preferences(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_preferences(text), public.set_whatsapp_preferences(text,text,boolean) TO authenticated;

CREATE TABLE public.wallet_whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.pending_payments(order_id),
  parent_id uuid NOT NULL REFERENCES public.parents(id),
  recipient_user_id uuid NOT NULL,
  recipient_role text NOT NULL CHECK(recipient_role IN ('parent','provider')),
  provider_id uuid REFERENCES public.providers(id),
  phone text NOT NULL,
  receipt jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','failed','unknown','cancelled')),
  claim_token uuid,
  message_id text,
  delivery_status text CHECK(delivery_status IN ('sent','delivered','read','failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz,
  UNIQUE(order_id,recipient_user_id,recipient_role)
);
ALTER TABLE public.wallet_whatsapp_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_whatsapp_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.wallet_whatsapp_outbox TO service_role;
CREATE INDEX wallet_whatsapp_queued ON public.wallet_whatsapp_outbox(created_at) WHERE status='queued';
CREATE INDEX wallet_whatsapp_message_id ON public.wallet_whatsapp_outbox(message_id) WHERE message_id IS NOT NULL;

CREATE FUNCTION public.queue_wallet_whatsapp_receipts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE wallet_used numeric; remaining numeric; total numeric; person public.parents%ROWTYPE;
  target record; items jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status IN ('completed','refunded') OR
    NOT coalesce((SELECT delivery_enabled FROM public.whatsapp_notification_settings WHERE id),false) THEN RETURN NEW; END IF;
  SELECT coalesce(sum((c->>'amount')::numeric),0) INTO wallet_used
    FROM jsonb_array_elements(coalesce(NEW.applied_credits,'[]')) c;
  IF wallet_used<=0 THEN RETURN NEW; END IF;
  SELECT * INTO person FROM public.parents WHERE id=NEW.parent_id;
  -- This is the available balance after consumption, excluding other pending holds.
  SELECT coalesce(sum(greatest(amount-used_amount-reserved_amount,0)),0) INTO remaining
    FROM public.parent_credits WHERE parent_id=NEW.parent_id AND is_active;
  SELECT coalesce(sum((i->>'total_price')::numeric),0) INTO total FROM jsonb_array_elements(NEW.cart_items) i;
  FOR target IN
    SELECT pref.*,NULL::uuid provider_id FROM public.whatsapp_preferences pref
      WHERE pref.user_id=person.user_id AND pref.recipient_role='parent' AND pref.enabled
    UNION ALL
    SELECT pref.*,p.id provider_id FROM public.providers p
      JOIN public.whatsapp_preferences pref ON pref.user_id=p.user_id AND pref.recipient_role='provider' AND pref.enabled
      WHERE p.is_active AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.cart_items) i
        JOIN public.menus m ON m.id=(i->>'menu_id')::uuid WHERE m.provider_id=p.id)
  LOOP
    SELECT jsonb_agg(jsonb_build_object('date',i->>'date','child',i->'child',
      'meal',i->'menu'->>'meal_name','amount',(i->>'total_price')::numeric,
      'supplements',CASE WHEN jsonb_typeof(i->'supplements')='array' THEN i->'supplements' ELSE coalesce(i->'supplements'->'items','[]') END) ORDER BY i->>'date',i->>'id') INTO items
      FROM jsonb_array_elements(NEW.cart_items) i
      WHERE target.provider_id IS NULL OR EXISTS(SELECT 1 FROM public.menus m WHERE m.id=(i->>'menu_id')::uuid AND m.provider_id=target.provider_id);
    INSERT INTO public.wallet_whatsapp_outbox(order_id,parent_id,recipient_user_id,recipient_role,provider_id,phone,receipt)
      VALUES(NEW.order_id,NEW.parent_id,target.user_id,target.recipient_role,target.provider_id,target.phone,
        jsonb_build_object('parent_name',concat_ws(' ',person.first_name,person.last_name),'items',items,
          'order_total',total,'wallet_used',wallet_used,'wallet_remaining',remaining,
          'confirmed_at',NEW.completed_at,'order_id',NEW.order_id))
      ON CONFLICT(order_id,recipient_user_id,recipient_role) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_wallet_whatsapp_receipts() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER queue_wallet_whatsapp_receipts AFTER UPDATE OF status ON public.pending_payments
  FOR EACH ROW EXECUTE FUNCTION public.queue_wallet_whatsapp_receipts();

CREATE FUNCTION public.claim_wallet_whatsapp_receipts(p_limit integer DEFAULT 10)
RETURNS SETOF public.wallet_whatsapp_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT coalesce((SELECT delivery_enabled FROM public.whatsapp_notification_settings WHERE id),false) THEN RETURN; END IF;
  -- A timed-out network attempt is ambiguous: never send it again automatically.
  UPDATE public.wallet_whatsapp_outbox SET status='unknown',error_code='worker_interrupted'
    WHERE status='sending' AND attempted_at<now()-interval '10 minutes';
  UPDATE public.wallet_whatsapp_outbox o SET status='cancelled',error_code='no_longer_eligible'
    WHERE o.status='queued' AND (o.created_at<now()-interval '24 hours' OR
      NOT EXISTS(SELECT 1 FROM public.pending_payments p WHERE p.order_id=o.order_id AND p.status='completed') OR
      NOT EXISTS(SELECT 1 FROM public.whatsapp_preferences pref WHERE pref.user_id=o.recipient_user_id
        AND pref.recipient_role=o.recipient_role AND pref.phone=o.phone AND pref.enabled) OR
      (o.recipient_role='provider' AND NOT EXISTS(SELECT 1 FROM public.providers p WHERE p.id=o.provider_id AND p.is_active AND p.user_id=o.recipient_user_id)));
  RETURN QUERY WITH chosen AS (
    SELECT id FROM public.wallet_whatsapp_outbox WHERE status='queued' ORDER BY created_at,id
      FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,10),20))
  ) UPDATE public.wallet_whatsapp_outbox o SET status='sending',claim_token=gen_random_uuid(),attempted_at=now()
    FROM chosen WHERE o.id=chosen.id RETURNING o.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_wallet_whatsapp_receipts(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wallet_whatsapp_receipts(integer) TO service_role;

COMMIT;
