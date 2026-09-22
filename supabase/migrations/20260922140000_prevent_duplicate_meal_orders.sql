-- Existing paid duplicates are kept for financial reconciliation.
-- A guard is used instead of a unique index so this migration can be applied
-- before those historical rows have been reviewed and cancelled.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_cart_items_meal
  ON public.cart_items(child_id, menu_id, date);
CREATE INDEX IF NOT EXISTS idx_reservations_active_meal
  ON public.reservations(child_id, menu_id, date)
  WHERE payment_status IS DISTINCT FROM 'cancelled';

CREATE OR REPLACE FUNCTION public.guard_duplicate_meal_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    IF NEW.payment_status = 'cancelled' THEN
      RETURN NEW;
    END IF;
    -- Existing duplicates can still be paid, annotated or cancelled.
    IF TG_OP = 'UPDATE' THEN
      IF OLD.payment_status IS DISTINCT FROM 'cancelled'
        AND (OLD.child_id, OLD.menu_id, OLD.date) = (NEW.child_id, NEW.menu_id, NEW.date) THEN
        RETURN NEW;
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.child_id, OLD.menu_id, OLD.date) = (NEW.child_id, NEW.menu_id, NEW.date) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- All writers, including school orders and callbacks, serialize per child.
  -- The definer reads see conflicting rows even when the caller's RLS does not.
  PERFORM c.id FROM public.children c WHERE c.id = NEW.child_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.child_id = NEW.child_id AND r.menu_id = NEW.menu_id AND r.date = NEW.date
      AND r.payment_status IS DISTINCT FROM 'cancelled'
      AND (TG_TABLE_NAME <> 'reservations' OR r.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505', CONSTRAINT = 'reservations_one_active_meal',
      MESSAGE = 'Ce repas est déjà réservé pour cet enfant à cette date. Consultez vos commandes.';
  END IF;

  IF TG_TABLE_NAME = 'cart_items' AND EXISTS (
    SELECT 1 FROM public.cart_items ci
    WHERE ci.child_id = NEW.child_id AND ci.menu_id = NEW.menu_id AND ci.date = NEW.date
      AND ci.id <> NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505', CONSTRAINT = 'cart_items_one_meal',
      MESSAGE = 'Ce repas est déjà dans votre panier pour cet enfant. Retirez la ligne en double avant de payer.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_duplicate_meal_order() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_duplicate_cart_meal ON public.cart_items;
CREATE TRIGGER guard_duplicate_cart_meal
  BEFORE INSERT OR UPDATE OF child_id, menu_id, date ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_duplicate_meal_order();
DROP TRIGGER IF EXISTS guard_duplicate_reservation_meal ON public.reservations;
CREATE TRIGGER guard_duplicate_reservation_meal
  BEFORE INSERT OR UPDATE OF child_id, menu_id, date, payment_status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_duplicate_meal_order();

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
    total_price, payment_status, payment_intent_id
  )
  SELECT payment.parent_id, (item->>'child_id')::uuid, (item->>'menu_id')::uuid,
    (item->>'date')::date, coalesce(nullif(item->'supplements', 'null'::jsonb), '[]'::jsonb),
    item->>'annotations', (item->>'total_price')::numeric, 'paid', p_transaction_id
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
