-- A checkout owns its meals and its credits before a bank form is opened.
-- Credit-only checkouts and bank callbacks use the same atomic completion.
BEGIN;

ALTER TABLE public.parent_credits
  ADD COLUMN IF NOT EXISTS reserved_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS source_reference text;
ALTER TABLE public.parent_credits DROP CONSTRAINT IF EXISTS parent_credits_available_check;
ALTER TABLE public.parent_credits ADD CONSTRAINT parent_credits_available_check
  CHECK (reserved_amount >= 0 AND used_amount + reserved_amount <= amount);
ALTER TABLE public.pending_payments ADD COLUMN IF NOT EXISTS checkout_key text;
CREATE UNIQUE INDEX IF NOT EXISTS pending_payments_checkout_key_unique
  ON public.pending_payments(checkout_key) WHERE checkout_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.meal_payment_holds (
  child_id uuid NOT NULL REFERENCES public.children(id),
  date date NOT NULL,
  order_id text NOT NULL REFERENCES public.pending_payments(order_id),
  PRIMARY KEY(child_id,date)
);
ALTER TABLE public.meal_payment_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meal_payment_holds FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.credit_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL,
  parent_id uuid NOT NULL REFERENCES public.parents(id),
  operation text NOT NULL,
  reference text,
  actor_id uuid,
  old_amount numeric(10,2), new_amount numeric(10,2),
  old_used numeric(10,2), new_used numeric(10,2),
  old_reserved numeric(10,2), new_reserved numeric(10,2),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_movements FROM anon, authenticated;
GRANT SELECT ON public.credit_movements TO authenticated;
DROP POLICY IF EXISTS credit_movements_read ON public.credit_movements;
CREATE POLICY credit_movements_read ON public.credit_movements FOR SELECT TO authenticated
  USING (parent_id=public.current_parent_id() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.record_credit_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NEW; END IF;
  INSERT INTO public.credit_movements(credit_id,parent_id,operation,reference,actor_id,
    old_amount,new_amount,old_used,new_used,old_reserved,new_reserved,reason)
  VALUES(coalesce(NEW.id,OLD.id),coalesce(NEW.parent_id,OLD.parent_id),TG_OP,
    coalesce(nullif(current_setting('app.checkout_order',true),''),NEW.source_reference,OLD.source_reference),
    auth.uid(),OLD.amount,NEW.amount,OLD.used_amount,NEW.used_amount,
    OLD.reserved_amount,NEW.reserved_amount,coalesce(NEW.reason,OLD.reason));
  RETURN coalesce(NEW,OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.record_credit_movement() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS record_credit_movement ON public.parent_credits;
CREATE TRIGGER record_credit_movement AFTER INSERT OR UPDATE OR DELETE ON public.parent_credits
  FOR EACH ROW EXECUTE FUNCTION public.record_credit_movement();

CREATE OR REPLACE FUNCTION public.guard_locked_cart_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.meal_payment_holds h
    JOIN public.pending_payments p ON p.order_id=h.order_id
    WHERE h.child_id=OLD.child_id AND h.date=OLD.date
      AND h.order_id IS DISTINCT FROM nullif(current_setting('app.checkout_order',true),'')
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.cart_items) i WHERE i->>'id'=OLD.id::text)) THEN
    RAISE EXCEPTION 'Un paiement est déjà en cours pour ce panier. Reprenez ce paiement ou contactez le support avant de modifier la commande.';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_locked_cart_item() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_locked_cart_item ON public.cart_items;
CREATE TRIGGER guard_locked_cart_item BEFORE UPDATE OR DELETE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_cart_item();

CREATE OR REPLACE FUNCTION public.guard_payment_reservation_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.payment_status='cancelled' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (OLD.child_id,OLD.date)=(NEW.child_id,NEW.date)
    AND OLD.payment_status IS DISTINCT FROM 'cancelled' THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.meal_payment_holds h WHERE h.child_id=NEW.child_id AND h.date=NEW.date
    AND h.order_id IS DISTINCT FROM nullif(current_setting('app.checkout_order',true),'')) THEN
    RAISE EXCEPTION 'Un paiement est déjà en cours pour cet enfant à cette date';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_payment_reservation_hold() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_payment_reservation_hold ON public.reservations;
CREATE TRIGGER guard_payment_reservation_hold BEFORE INSERT OR UPDATE OF child_id,date,payment_status
  ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.guard_payment_reservation_hold();

CREATE OR REPLACE FUNCTION public.complete_payzone_payment(p_order_id text,p_transaction_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment public.pending_payments%ROWTYPE; applied record; owner_id uuid; held numeric;
BEGIN
  SELECT parent_id INTO owner_id FROM public.pending_payments WHERE order_id=p_order_id;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Commande de paiement introuvable'; END IF;
  PERFORM id FROM public.parents WHERE id=owner_id FOR UPDATE;
  SELECT * INTO payment FROM public.pending_payments WHERE order_id=p_order_id FOR UPDATE;
  IF payment.status IN ('completed','refunded') THEN RETURN false; END IF;
  IF coalesce(p_transaction_id,'')='' OR p_transaction_id IS DISTINCT FROM payment.charge_id THEN
    RAISE EXCEPTION 'Référence de paiement incohérente';
  END IF;
  IF jsonb_typeof(payment.cart_items) IS DISTINCT FROM 'array' OR jsonb_array_length(payment.cart_items)=0 THEN
    RAISE EXCEPTION 'Panier de paiement invalide';
  END IF;
  PERFORM set_config('app.checkout_order',p_order_id,true);
  PERFORM c.id FROM public.children c WHERE c.id IN
    (SELECT (i->>'child_id')::uuid FROM jsonb_array_elements(payment.cart_items) i) ORDER BY c.id FOR UPDATE;
  PERFORM pc.id FROM public.parent_credits pc WHERE pc.id IN
    (SELECT (i->>'credit_id')::uuid FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) i)
    ORDER BY pc.id FOR UPDATE;

  INSERT INTO public.reservations(parent_id,child_id,menu_id,date,supplements,annotations,
    total_price,payment_status,payment_intent_id,confirmed_daily_quantity,repeat_order_confirmed_at,source_cart_item_id)
  SELECT payment.parent_id,(i->>'child_id')::uuid,(i->>'menu_id')::uuid,(i->>'date')::date,
    coalesce(nullif(i->'supplements','null'),'[]'),i->>'annotations',(i->>'total_price')::numeric,
    'paid',p_transaction_id,coalesce((i->>'confirmed_daily_quantity')::integer,1),
    (i->>'repeat_order_confirmed_at')::timestamptz,(i->>'id')::uuid
  FROM jsonb_array_elements(payment.cart_items) i;

  FOR applied IN SELECT (c->>'credit_id')::uuid id,sum((c->>'amount')::numeric) amount,
    bool_and((c->>'amount')::numeric>0) valid
    FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) c GROUP BY (c->>'credit_id')::uuid
  LOOP
    IF applied.valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Montant de crédit invalide'; END IF;
    held := CASE WHEN payment.checkout_key IS NULL THEN 0 ELSE applied.amount END;
    UPDATE public.parent_credits SET used_amount=used_amount+applied.amount,reserved_amount=reserved_amount-held
      WHERE id=applied.id AND parent_id=payment.parent_id
        AND reserved_amount>=held AND used_amount+reserved_amount-held+applied.amount<=amount
        AND (held>0 OR is_active);
    IF NOT FOUND THEN RAISE EXCEPTION 'Crédit cagnotte indisponible pour cette commande'; END IF;
  END LOOP;
  DELETE FROM public.cart_items WHERE parent_id=payment.parent_id
    AND id IN(SELECT (i->>'id')::uuid FROM jsonb_array_elements(payment.cart_items) i);
  DELETE FROM public.meal_payment_holds WHERE order_id=p_order_id;
  UPDATE public.pending_payments SET status='completed',payzone_transaction_id=p_transaction_id,
    payzone_status=CASE WHEN total_amount=0 THEN 'CREDIT' ELSE 'CHARGED' END,
    completed_at=now(),failure_reason=NULL WHERE id=payment.id;
  PERFORM set_config('app.checkout_order','',true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_payzone_payment(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payzone_payment(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_meal_checkout(
  p_parent_id uuid,p_items jsonb,p_bank_amount numeric,p_credits jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  cart_ids uuid[]; key text; payment public.pending_payments%ROWTYPE;
  snapshot jsonb; ci record; grouping record; credit record; subtotal numeric:=0;
  credit_total numeric:=0; supplement_total numeric; supplement_ids uuid[]; supplement_count integer;
  unit_price numeric; new_order text; new_charge text; stamp text; active_count integer; legacy_count integer; legacy public.pending_payments%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 OR
    jsonb_typeof(p_credits) IS DISTINCT FROM 'array' OR p_bank_amount IS NULL OR p_bank_amount<0 THEN
    RAISE EXCEPTION 'Paramètres de commande invalides';
  END IF;
  SELECT array_agg((i->>'id')::uuid ORDER BY i->>'id') INTO cart_ids FROM jsonb_array_elements(p_items) i;
  IF cardinality(cart_ids)<>(SELECT count(DISTINCT x) FROM unnest(cart_ids) x) THEN
    RAISE EXCEPTION 'Le panier contient une ligne répétée';
  END IF;
  PERFORM id FROM public.parents WHERE id=p_parent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent introuvable'; END IF;
  key:=md5(p_parent_id::text || array_to_string(cart_ids,','));
  SELECT * INTO payment FROM public.pending_payments WHERE checkout_key=key FOR UPDATE;
  IF FOUND THEN
    IF payment.status='refunded' THEN RAISE EXCEPTION 'Cette commande a déjà été remboursée'; END IF;
    RETURN to_jsonb(payment)||jsonb_build_object('reused',true);
  END IF;
  PERFORM c.id FROM public.children c JOIN public.cart_items cart_lock ON cart_lock.child_id=c.id
    WHERE cart_lock.id=ANY(cart_ids) ORDER BY c.id FOR UPDATE OF c;
  PERFORM id FROM public.cart_items WHERE id=ANY(cart_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.cart_items WHERE id=ANY(cart_ids) AND parent_id=p_parent_id)<>cardinality(cart_ids) THEN
    RAISE EXCEPTION 'Votre panier a changé ou cette commande a déjà été enregistrée';
  END IF;
  IF EXISTS(SELECT 1 FROM public.reservations WHERE source_cart_item_id=ANY(cart_ids)) THEN
    RAISE EXCEPTION 'Cette commande a déjà été enregistrée';
  END IF;
  -- Legacy paywalls remain capable of receiving a late bank callback. Reuse an
  -- exact old basket; never open a new charge while another old basket overlaps.
  SELECT count(*) INTO legacy_count FROM public.pending_payments p
    WHERE p.parent_id=p_parent_id AND p.checkout_key IS NULL AND p.status NOT IN ('completed','refunded')
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.cart_items) i JOIN public.cart_items c
        ON c.child_id=(i->>'child_id')::uuid AND c.date=(i->>'date')::date WHERE c.id=ANY(cart_ids));
  IF legacy_count>1 THEN RAISE EXCEPTION 'Plusieurs anciens paiements doivent être vérifiés. Contactez le support avant de recommencer'; END IF;
  IF legacy_count=1 THEN
    SELECT * INTO legacy FROM public.pending_payments p WHERE p.parent_id=p_parent_id
      AND p.checkout_key IS NULL AND p.status NOT IN ('completed','refunded')
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.cart_items) i JOIN public.cart_items c
        ON c.child_id=(i->>'child_id')::uuid AND c.date=(i->>'date')::date WHERE c.id=ANY(cart_ids)) FOR UPDATE;
    IF legacy.payzone_status='CHARGED' OR legacy.charge_id IS NULL OR
      (SELECT array_agg((i->>'id')::uuid ORDER BY i->>'id') FROM jsonb_array_elements(legacy.cart_items) i) IS DISTINCT FROM cart_ids
      OR legacy.total_amount IS DISTINCT FROM p_bank_amount OR legacy.applied_credits IS DISTINCT FROM p_credits THEN
      RAISE EXCEPTION 'Un ancien paiement doit être vérifié pour ces repas. Contactez le support avant de recommencer';
    END IF;
  END IF;
  snapshot:='[]';
  FOR ci IN SELECT x.*,c.first_name,c.last_name,c.parent_id child_parent,c.school_id child_school,
    m.school_id menu_school,m.date menu_date,m.available,m.price menu_price,m.meal_name,
    m.supplements enabled_supplements
    FROM public.cart_items x JOIN public.children c ON c.id=x.child_id JOIN public.menus m ON m.id=x.menu_id
    WHERE x.id=ANY(cart_ids) ORDER BY x.id
  LOOP
    IF ci.child_parent<>p_parent_id OR ci.child_school IS DISTINCT FROM ci.menu_school OR
      ci.menu_date<>ci.date OR NOT ci.available OR
      (now() AT TIME ZONE 'Africa/Casablanca') >= ci.date+time '07:00' THEN
      RAISE EXCEPTION 'Ce repas n’est plus disponible pour cet enfant à cette date';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) i WHERE i->>'id'=ci.id::text
      AND i->>'child_id'=ci.child_id::text AND i->>'menu_id'=ci.menu_id::text
      AND i->>'date'=ci.date::text AND (i->>'total_price')::numeric=ci.total_price) THEN
      RAISE EXCEPTION 'Votre panier a changé. Vérifiez-le avant de payer';
    END IF;
    SELECT coalesce(array_agg((s->>'id')::uuid),'{}') INTO supplement_ids
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ci.supplements)='array' THEN ci.supplements
        ELSE coalesce(ci.supplements->'items','[]') END) s;
    SELECT count(*),coalesce(sum(s.price),0) INTO supplement_count,supplement_total
      FROM public.provider_supplements s WHERE s.id=ANY(supplement_ids) AND s.available
      AND (s.menu_id=ci.menu_id OR to_jsonb(ci.enabled_supplements) ? s.id::text);
    IF supplement_count<>cardinality(supplement_ids) THEN RAISE EXCEPTION 'Supplément indisponible'; END IF;
    unit_price:=round(ci.menu_price+supplement_total,2);
    IF unit_price IS DISTINCT FROM ci.total_price OR unit_price<0 THEN
      RAISE EXCEPTION 'Le prix du repas a changé. Vérifiez votre panier';
    END IF;
    subtotal:=subtotal+unit_price;
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',ci.id,'child_id',ci.child_id,
      'menu_id',ci.menu_id,'date',ci.date,'total_price',unit_price,'supplements',ci.supplements,
      'annotations',ci.annotations,'confirmed_daily_quantity',ci.confirmed_daily_quantity,
      'repeat_order_confirmed_at',ci.repeat_order_confirmed_at,
      'child',jsonb_build_object('first_name',ci.first_name,'last_name',ci.last_name),
      'menu',jsonb_build_object('meal_name',ci.meal_name)));
  END LOOP;
  IF jsonb_array_length(snapshot)<>cardinality(cart_ids) THEN RAISE EXCEPTION 'Panier incomplet'; END IF;
  FOR grouping IN SELECT (i->>'child_id')::uuid child_id,(i->>'date')::date date,count(*) quantity,
    max(CASE WHEN nullif(i->>'repeat_order_confirmed_at','') IS NOT NULL THEN
      (i->>'confirmed_daily_quantity')::integer ELSE 1 END) approved,
    max(i->>'repeat_order_confirmed_at') confirmed_at
    FROM jsonb_array_elements(snapshot) i GROUP BY i->>'child_id',i->>'date'
  LOOP
    IF EXISTS(SELECT 1 FROM public.meal_payment_holds h WHERE h.child_id=grouping.child_id AND h.date=grouping.date) THEN
      RAISE EXCEPTION 'Un paiement est déjà en cours pour cet enfant ce jour-là. Reprenez le panier initial avant de recommencer';
    END IF;
    SELECT count(*) INTO active_count FROM public.reservations r WHERE r.child_id=grouping.child_id
      AND r.date=grouping.date AND r.payment_status IS DISTINCT FROM 'cancelled';
    IF active_count+grouping.quantity>grouping.approved THEN
      RAISE EXCEPTION 'Un repas est déjà commandé ou présent plusieurs fois. Confirmez le repas supplémentaire dans votre panier';
    END IF;
    -- Consent belongs to the group; all inserts carry it regardless of row order.
    SELECT jsonb_agg(CASE WHEN i->>'child_id'=grouping.child_id::text AND i->>'date'=grouping.date::text
      THEN i||jsonb_build_object('confirmed_daily_quantity',grouping.approved,'repeat_order_confirmed_at',grouping.confirmed_at)
      ELSE i END) INTO snapshot FROM jsonb_array_elements(snapshot) i;
  END LOOP;
  SELECT coalesce(sum((c->>'amount')::numeric),0) INTO credit_total FROM jsonb_array_elements(p_credits) c;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_credits) c WHERE coalesce((c->>'amount')::numeric,0)<=0)
    OR round(p_bank_amount,2)<>p_bank_amount OR round(credit_total,2)<>credit_total
    OR subtotal<>p_bank_amount+credit_total THEN RAISE EXCEPTION 'Le total ou la cagnotte a changé. Vérifiez votre panier'; END IF;
  stamp:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text;
  new_charge:=CASE WHEN p_bank_amount=0 THEN 'CRD_' ELSE 'CHG_' END||stamp||'_'||substr(md5(key),1,8);
  new_order:=CASE WHEN p_bank_amount=0 THEN new_charge ELSE 'CK_'||stamp||'_'||left(p_parent_id::text,8) END;
  IF legacy_count=1 THEN new_order:=legacy.order_id; new_charge:=legacy.charge_id; END IF;
  PERFORM set_config('app.checkout_order',new_order,true);
  PERFORM pc.id FROM public.parent_credits pc WHERE pc.id IN
    (SELECT (c->>'credit_id')::uuid FROM jsonb_array_elements(p_credits) c) ORDER BY pc.id FOR UPDATE;
  FOR credit IN SELECT (c->>'credit_id')::uuid id,sum((c->>'amount')::numeric) amount
    FROM jsonb_array_elements(p_credits) c GROUP BY (c->>'credit_id')::uuid
  LOOP
    UPDATE public.parent_credits SET reserved_amount=reserved_amount+credit.amount
      WHERE id=credit.id AND parent_id=p_parent_id AND is_active
        AND amount-used_amount-reserved_amount>=credit.amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Crédit cagnotte indisponible. Actualisez votre panier'; END IF;
  END LOOP;
  INSERT INTO public.pending_payments(order_id,charge_id,parent_id,cart_items,total_amount,status,applied_credits,checkout_key,expires_at)
    VALUES(new_order,new_charge,p_parent_id,snapshot,p_bank_amount,'pending',p_credits,key,NULL)
    ON CONFLICT(order_id) DO UPDATE SET cart_items=EXCLUDED.cart_items,checkout_key=EXCLUDED.checkout_key,expires_at=NULL;
  INSERT INTO public.meal_payment_holds(child_id,date,order_id)
    SELECT DISTINCT (i->>'child_id')::uuid,(i->>'date')::date,new_order FROM jsonb_array_elements(snapshot) i;
  IF p_bank_amount=0 THEN PERFORM public.complete_payzone_payment(new_order,new_charge); END IF;
  SELECT * INTO payment FROM public.pending_payments WHERE order_id=new_order;
  PERFORM set_config('app.checkout_order','',true);
  RETURN to_jsonb(payment)||jsonb_build_object('reused',false);
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_meal_checkout(uuid,jsonb,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_meal_checkout(uuid,jsonb,numeric,jsonb) TO service_role;

-- A parent can no longer claim a paid reservation or change a balance directly.
-- Admin/provider management retains its existing, scoped policies and is audited.
DROP POLICY IF EXISTS reservations_insert_parent ON public.reservations;
DROP POLICY IF EXISTS reservations_update_parent ON public.reservations;
DROP POLICY IF EXISTS parent_credits_insert_self ON public.parent_credits;
DROP POLICY IF EXISTS parent_credits_update_self ON public.parent_credits;

CREATE OR REPLACE FUNCTION public.cancel_meal_with_credit(p_reservation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.reservations%ROWTYPE; owner_id uuid; credit_id uuid; week_start date;
BEGIN
  owner_id:=public.current_parent_id();
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  PERFORM id FROM public.parents WHERE id=owner_id FOR UPDATE;
  SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id AND parent_id=owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable'; END IF;
  SELECT id INTO credit_id FROM public.parent_credits WHERE source_reservation_id=r.id;
  IF credit_id IS NOT NULL THEN RETURN credit_id; END IF;
  IF r.payment_status IS DISTINCT FROM 'paid' OR r.created_by_school OR r.school_payment_pending THEN
    RAISE EXCEPTION 'Cette réservation ne peut pas être annulée par cagnotte';
  END IF;
  IF (now() AT TIME ZONE 'Africa/Casablanca')>=r.date+time '07:00' THEN
    RAISE EXCEPTION 'L’annulation n’est plus possible après 7 h le jour du repas';
  END IF;
  week_start:=date_trunc('week',r.date)::date;
  IF (SELECT count(*) FROM public.parent_credits WHERE parent_id=owner_id AND meal_week_start_date=week_start)>=2 THEN
    RAISE EXCEPTION 'La limite de deux annulations pour cette semaine est atteinte';
  END IF;
  PERFORM set_config('app.checkout_order','CANCEL_'||r.id::text,true);
  UPDATE public.reservations SET payment_status='cancelled',cancelled_at=now() WHERE id=r.id;
  INSERT INTO public.parent_credits(parent_id,amount,used_amount,source_reservation_id,meal_week_start_date,reason,source_reference)
    VALUES(owner_id,r.total_price,0,r.id,week_start,'Annulation de repas','CANCEL_'||r.id::text) RETURNING id INTO credit_id;
  PERFORM set_config('app.checkout_order','',true);
  RETURN credit_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_meal_with_credit(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_meal_with_credit(uuid) TO authenticated;

COMMIT;
