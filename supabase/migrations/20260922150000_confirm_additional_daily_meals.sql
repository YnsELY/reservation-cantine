-- Parent consent is scoped to a child/day and a displayed total quantity.
-- Historical reservations are preserved, without granting consent for new meals.
BEGIN;

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS confirmed_daily_quantity integer NOT NULL DEFAULT 1 CHECK (confirmed_daily_quantity >= 1),
  ADD COLUMN IF NOT EXISTS repeat_order_confirmed_at timestamptz;
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS confirmed_daily_quantity integer NOT NULL DEFAULT 1 CHECK (confirmed_daily_quantity >= 1),
  ADD COLUMN IF NOT EXISTS repeat_order_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_cart_item_id uuid;

CREATE INDEX IF NOT EXISTS idx_cart_items_child_day ON public.cart_items(child_id, date);
CREATE INDEX IF NOT EXISTS idx_reservations_active_child_day ON public.reservations(child_id, date)
  WHERE payment_status IS DISTINCT FROM 'cancelled';
-- An intentional second meal has its own cart id. Retrying one checkout never
-- creates the same purchased line again, including after cancellation.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_source_cart_item_unique
  ON public.reservations(source_cart_item_id) WHERE source_cart_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_duplicate_meal_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reserved_count integer;
  cart_count integer := 0;
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    IF NEW.payment_status = 'cancelled' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
      -- Preserve the ability to annotate/pay/cancel historical duplicates.
      IF OLD.payment_status IS DISTINCT FROM 'cancelled'
        AND (OLD.child_id, OLD.menu_id, OLD.date) = (NEW.child_id, NEW.menu_id, NEW.date) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.child_id, OLD.date) IS DISTINCT FROM (NEW.child_id, NEW.date) THEN
      NEW.confirmed_daily_quantity := 1;
      NEW.repeat_order_confirmed_at := NULL;
    END IF;
  END IF;

  PERFORM c.id FROM public.children c WHERE c.id = NEW.child_id FOR UPDATE;
  SELECT count(*) INTO reserved_count FROM public.reservations r
    WHERE r.child_id = NEW.child_id AND r.date = NEW.date
      AND r.payment_status IS DISTINCT FROM 'cancelled'
      AND (TG_TABLE_NAME <> 'reservations' OR r.id <> NEW.id);
  IF TG_TABLE_NAME = 'cart_items' THEN
    SELECT count(*) INTO cart_count FROM public.cart_items ci
      WHERE ci.child_id = NEW.child_id AND ci.date = NEW.date AND ci.id <> NEW.id;
  END IF;

  IF reserved_count + cart_count + 1 > NEW.confirmed_daily_quantity THEN
    RAISE EXCEPTION USING ERRCODE = '23505', CONSTRAINT = 'meal_order_requires_confirmation',
      MESSAGE = 'Un repas est déjà commandé ou dans le panier pour cet enfant à cette date. Revenez au panier pour vérifier et confirmer le repas supplémentaire.';
  END IF;

  IF NEW.confirmed_daily_quantity > 1 THEN
    IF TG_TABLE_NAME = 'cart_items' THEN
      IF TG_OP = 'INSERT' THEN
        NEW.repeat_order_confirmed_at := now();
      ELSIF NEW.confirmed_daily_quantity IS DISTINCT FROM OLD.confirmed_daily_quantity
        OR OLD.repeat_order_confirmed_at IS NULL THEN
        NEW.repeat_order_confirmed_at := now();
      ELSE
        NEW.repeat_order_confirmed_at := OLD.repeat_order_confirmed_at;
      END IF;
    ELSE
      NEW.repeat_order_confirmed_at := coalesce(NEW.repeat_order_confirmed_at, now());
    END IF;
  ELSE
    NEW.repeat_order_confirmed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_duplicate_cart_meal ON public.cart_items;
CREATE TRIGGER guard_duplicate_cart_meal
  BEFORE INSERT OR UPDATE OF child_id, menu_id, date, confirmed_daily_quantity ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_duplicate_meal_order();
-- The reservation trigger from the preceding migration calls this new function.
REVOKE ALL ON FUNCTION public.guard_duplicate_meal_order() FROM PUBLIC, anon, authenticated;

-- Finalize all database effects together. A replay/concurrent CHARGED callback
-- returns false; a failure rolls back reservations, cart removal and credits.
CREATE OR REPLACE FUNCTION public.complete_payzone_payment(p_order_id text, p_transaction_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payment public.pending_payments%ROWTYPE;
  applied record;
BEGIN
  IF coalesce(p_transaction_id, '') = '' THEN
    RAISE EXCEPTION 'Référence de paiement manquante';
  END IF;

  SELECT * INTO payment FROM public.pending_payments
    WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande de paiement introuvable';
  END IF;
  IF payment.status IN ('completed', 'refunded') THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(payment.cart_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(payment.cart_items) = 0 THEN
    RAISE EXCEPTION 'Panier de paiement invalide';
  END IF;

  -- Stable lock order for a payment containing several children/credits.
  PERFORM c.id FROM public.children c
    WHERE c.id IN (SELECT (item->>'child_id')::uuid FROM jsonb_array_elements(payment.cart_items) item)
    ORDER BY c.id FOR UPDATE;
  PERFORM pc.id FROM public.parent_credits pc
    WHERE pc.id IN (SELECT (credit->>'credit_id')::uuid
      FROM jsonb_array_elements(coalesce(payment.applied_credits, '[]'::jsonb)) credit)
    ORDER BY pc.id FOR UPDATE;

  INSERT INTO public.reservations (
    parent_id, child_id, menu_id, date, supplements, annotations,
    total_price, payment_status, payment_intent_id,
    confirmed_daily_quantity, repeat_order_confirmed_at, source_cart_item_id
  )
  SELECT payment.parent_id, (item->>'child_id')::uuid, (item->>'menu_id')::uuid,
    (item->>'date')::date, coalesce(nullif(item->'supplements', 'null'::jsonb), '[]'::jsonb),
    item->>'annotations', (item->>'total_price')::numeric, 'paid', p_transaction_id,
    coalesce((item->>'confirmed_daily_quantity')::integer, 1),
    (item->>'repeat_order_confirmed_at')::timestamptz, (item->>'id')::uuid
  FROM jsonb_array_elements(payment.cart_items) item;

  FOR applied IN
    SELECT (credit->>'credit_id')::uuid AS credit_id,
      sum((credit->>'amount')::numeric) AS amount,
      bool_and((credit->>'amount')::numeric > 0) AS valid
    FROM jsonb_array_elements(coalesce(payment.applied_credits, '[]'::jsonb)) credit
    GROUP BY (credit->>'credit_id')::uuid
  LOOP
    IF applied.valid IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Montant de crédit invalide';
    END IF;
    UPDATE public.parent_credits
      SET used_amount = used_amount + applied.amount
      WHERE id = applied.credit_id AND parent_id = payment.parent_id
        AND is_active AND used_amount + applied.amount <= amount;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Crédit cagnotte indisponible pour cette commande';
    END IF;
  END LOOP;

  DELETE FROM public.cart_items
    WHERE parent_id = payment.parent_id
      AND id IN (SELECT (item->>'id')::uuid FROM jsonb_array_elements(payment.cart_items) item);
  UPDATE public.pending_payments
    SET status = 'completed', payzone_transaction_id = p_transaction_id,
      payzone_status = 'CHARGED', completed_at = now(), failure_reason = NULL
    WHERE id = payment.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payzone_payment(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payzone_payment(text, text) TO service_role;

COMMIT;
