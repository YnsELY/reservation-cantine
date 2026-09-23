BEGIN;
ALTER TABLE public.pending_payments ADD COLUMN released_at timestamptz;
ALTER TABLE public.pending_payments ADD COLUMN last_checked_at timestamptz;

-- Only a signed terminal callback or the authenticated PayZone GET response is
-- allowed to release funds. A browser return URL or elapsed timeout is not proof.
CREATE OR REPLACE FUNCTION public.release_failed_checkout(p_order_id text,p_transaction_id text,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment public.pending_payments%ROWTYPE; owner_id uuid; applied record;
BEGIN
 IF p_status NOT IN ('DECLINED','CANCELLED','ERROR','AUTH_REVERSED') THEN
   RAISE EXCEPTION 'Le paiement n’est pas définitivement refusé.';
 END IF;
 SELECT parent_id INTO owner_id FROM public.pending_payments WHERE order_id=p_order_id;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Paiement introuvable.'; END IF;
 PERFORM id FROM public.parents WHERE id=owner_id FOR UPDATE;
 SELECT * INTO payment FROM public.pending_payments WHERE order_id=p_order_id FOR UPDATE;
 IF payment.charge_id IS DISTINCT FROM p_transaction_id THEN RAISE EXCEPTION 'Référence de paiement incohérente'; END IF;
 IF payment.status IN ('completed','refunded') OR payment.payzone_status IN ('CHARGED','REFUNDED')
   OR payment.released_at IS NOT NULL THEN RETURN false; END IF;
 PERFORM set_config('app.checkout_order',p_order_id,true);
 -- Lock order matches checkout/completion: family, payment, children, credits.
 PERFORM id FROM public.children WHERE id IN
   (SELECT (i->>'child_id')::uuid FROM jsonb_array_elements(payment.cart_items) i) ORDER BY id FOR UPDATE;
 IF payment.checkout_key IS NOT NULL THEN
   FOR applied IN SELECT (i->>'credit_id')::uuid id,sum((i->>'amount')::numeric) amount
     FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) i GROUP BY (i->>'credit_id')::uuid ORDER BY 1
   LOOP
     UPDATE public.parent_credits SET reserved_amount=reserved_amount-applied.amount
       WHERE id=applied.id AND parent_id=owner_id AND reserved_amount>=applied.amount;
     IF NOT FOUND THEN RAISE EXCEPTION 'Le crédit réservé doit être rapproché avant de libérer le paiement.'; END IF;
   END LOOP;
 END IF;
 DELETE FROM public.meal_payment_holds WHERE order_id=p_order_id;
 UPDATE public.pending_payments SET status='failed',payzone_status=p_status,payzone_transaction_id=p_transaction_id,
   released_at=now(),checkout_key=NULL,failed_at=now(),failure_reason=p_status,last_checked_at=now()
   WHERE id=payment.id;
 PERFORM set_config('app.checkout_order','',true);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.release_failed_checkout(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_failed_checkout(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.resume_meal_checkout(p_parent_id uuid,p_order_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment public.pending_payments%ROWTYPE;
BEGIN
 PERFORM id FROM public.parents WHERE id=p_parent_id FOR UPDATE;
 SELECT * INTO payment FROM public.pending_payments WHERE parent_id=p_parent_id AND order_id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable.'; END IF;
 IF payment.status='completed' THEN RETURN to_jsonb(payment)||jsonb_build_object('reused',true); END IF;
 IF payment.released_at IS NOT NULL OR payment.payzone_status IN ('REFUNDED','CHARGED','DECLINED','CANCELLED','ERROR','AUTH_REVERSED') THEN
   RAISE EXCEPTION 'Vérifiez le statut de ce paiement avant de reprendre votre panier.';
 END IF;
 IF payment.checkout_key IS NULL THEN RAISE EXCEPTION 'Cet ancien paiement doit être vérifié avant toute nouvelle tentative.'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(payment.cart_items) i
   WHERE ((i->>'date')::date + time '07:00') <= now() AT TIME ZONE 'Africa/Casablanca') THEN
   RAISE EXCEPTION 'La commande est clôturée. Vérifiez le paiement ou contactez le support avec sa référence.';
 END IF;
 RETURN to_jsonb(payment)||jsonb_build_object('reused',true);
END $$;
REVOKE ALL ON FUNCTION public.resume_meal_checkout(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resume_meal_checkout(uuid,text) TO service_role;

-- Revised completion and preparation definitions are appended below.

CREATE OR REPLACE FUNCTION public.complete_payzone_payment(p_order_id text,p_transaction_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment public.pending_payments%ROWTYPE; applied record; owner_id uuid; held numeric;
BEGIN
  SELECT parent_id INTO owner_id FROM public.pending_payments WHERE order_id=p_order_id;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Commande de paiement introuvable'; END IF;
  PERFORM id FROM public.parents WHERE id=owner_id FOR UPDATE;
  SELECT * INTO payment FROM public.pending_payments WHERE order_id=p_order_id FOR UPDATE;
  IF payment.status IN ('completed','refunded') THEN RETURN false; END IF;
  IF payment.released_at IS NOT NULL THEN RAISE EXCEPTION 'Paiement reçu après libération : rapprochement nécessaire, aucune nouvelle réservation automatique.'; END IF;
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
  unit_price numeric; new_order text; new_charge text; stamp text; active_count integer; legacy_count integer; legacy public.pending_payments%ROWTYPE; failed_checkout record;
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
  FOR failed_checkout IN SELECT order_id,charge_id,payzone_status FROM public.pending_payments
    WHERE parent_id=p_parent_id AND released_at IS NULL AND status='failed'
      AND payzone_status IN ('DECLINED','CANCELLED','ERROR','AUTH_REVERSED')
  LOOP
    PERFORM public.release_failed_checkout(failed_checkout.order_id,failed_checkout.charge_id,failed_checkout.payzone_status);
  END LOOP;
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
    WHERE p.parent_id=p_parent_id AND p.checkout_key IS NULL AND p.released_at IS NULL AND p.status NOT IN ('completed','refunded')
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.cart_items) i JOIN public.cart_items c
        ON c.child_id=(i->>'child_id')::uuid AND c.date=(i->>'date')::date WHERE c.id=ANY(cart_ids));
  IF legacy_count>1 THEN RAISE EXCEPTION 'Plusieurs anciens paiements doivent être vérifiés. Contactez le support avant de recommencer'; END IF;
  IF legacy_count=1 THEN
    SELECT * INTO legacy FROM public.pending_payments p WHERE p.parent_id=p_parent_id
      AND p.checkout_key IS NULL AND p.released_at IS NULL AND p.status NOT IN ('completed','refunded')
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
-- Kept for compatibility with any old scheduler. A clock alone cannot establish
-- the outcome of a bank transaction; reconciliation owns state transitions now.
CREATE OR REPLACE FUNCTION public.cleanup_expired_pending_payments()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN; END $$;
REVOKE ALL ON FUNCTION public.cleanup_expired_pending_payments() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_pending_payments() TO service_role;
COMMIT;
