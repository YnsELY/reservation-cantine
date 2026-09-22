-- A confirmed bank refund also releases/restores the wallet part of the order.
-- Orders already compensated by a separate wallet grant require reconciliation.
BEGIN;
CREATE OR REPLACE FUNCTION public.refund_payzone_payment(p_order_id text,p_transaction_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment public.pending_payments%ROWTYPE; owner_id uuid; applied record;
BEGIN
  SELECT parent_id INTO owner_id FROM public.pending_payments WHERE order_id=p_order_id;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  PERFORM id FROM public.parents WHERE id=owner_id FOR UPDATE;
  SELECT * INTO payment FROM public.pending_payments WHERE order_id=p_order_id FOR UPDATE;
  IF payment.status='refunded' THEN RETURN false; END IF;
  IF p_transaction_id IS DISTINCT FROM payment.charge_id OR coalesce(p_transaction_id,'')='' THEN
    RAISE EXCEPTION 'Référence de remboursement incohérente';
  END IF;
  PERFORM id FROM public.reservations WHERE payment_intent_id=p_transaction_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.parent_credits c JOIN public.reservations r ON r.id=c.source_reservation_id
    WHERE r.payment_intent_id=p_transaction_id) THEN
    RAISE EXCEPTION 'Un avoir existe déjà pour cette commande. Rapprochement manuel requis pour éviter un double remboursement';
  END IF;
  IF payment.checkout_key IS NULL AND payment.status<>'completed' AND
    EXISTS(SELECT 1 FROM public.reservations WHERE payment_intent_id=p_transaction_id) THEN
    RAISE EXCEPTION 'Ancienne commande partiellement enregistrée : rapprochement manuel requis';
  END IF;
  PERFORM set_config('app.checkout_order',p_order_id,true);
  PERFORM id FROM public.parent_credits WHERE id IN
    (SELECT (c->>'credit_id')::uuid FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) c)
    ORDER BY id FOR UPDATE;
  FOR applied IN SELECT (c->>'credit_id')::uuid id,sum((c->>'amount')::numeric) amount
    FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) c GROUP BY c->>'credit_id'
  LOOP
    IF applied.amount IS NULL OR applied.amount<=0 THEN RAISE EXCEPTION 'Crédit invalide'; END IF;
    IF payment.status='completed' THEN
      UPDATE public.parent_credits SET used_amount=used_amount-applied.amount
        WHERE id=applied.id AND parent_id=owner_id AND used_amount>=applied.amount;
      IF NOT FOUND THEN RAISE EXCEPTION 'Crédit à rapprocher avant restitution'; END IF;
    ELSIF payment.checkout_key IS NOT NULL THEN
      UPDATE public.parent_credits SET reserved_amount=reserved_amount-applied.amount
        WHERE id=applied.id AND parent_id=owner_id AND reserved_amount>=applied.amount;
      IF NOT FOUND THEN RAISE EXCEPTION 'Crédit réservé à rapprocher'; END IF;
    END IF;
  END LOOP;
  UPDATE public.reservations SET payment_status='cancelled',cancelled_at=coalesce(cancelled_at,now())
    WHERE payment_intent_id=p_transaction_id;
  DELETE FROM public.meal_payment_holds WHERE order_id=p_order_id;
  -- A refunded checkout's original cart ids must not reopen a bank form.
  DELETE FROM public.cart_items WHERE parent_id=owner_id AND id IN
    (SELECT (i->>'id')::uuid FROM jsonb_array_elements(payment.cart_items) i);
  UPDATE public.pending_payments SET status='refunded',payzone_status='REFUNDED',
    refunded_at=now(),failure_reason=NULL WHERE order_id=p_order_id;
  PERFORM set_config('app.checkout_order','',true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.refund_payzone_payment(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_payzone_payment(text,text) TO service_role;
COMMIT;
