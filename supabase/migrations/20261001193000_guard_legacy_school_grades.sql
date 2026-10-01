-- Apply the existing La Vertu grade rule to legacy children when ordering.
-- Do not change enrollment, historical meals or completion of bank payments.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_child_grade_for_order(p_child_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.children c JOIN public.schools s ON s.id = c.school_id
    WHERE c.id = p_child_id AND s.name ~* '\mla[[:space:]-]+vertu\M'
      AND NULLIF(btrim(c.grade), '') IS NOT NULL
      AND btrim(c.grade) NOT IN (
        'Petite Section', 'Moyenne Section', 'Grande Section',
        'CP', 'CE1', 'CE2', 'CM1', 'CM2'
      )
  ) THEN
    RAISE EXCEPTION 'La classe de cet enfant ne correspond pas à La Vertu (maternelle à CM2). Vérifiez sa fiche et son école avant de commander.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_child_grade_for_order(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_order_child_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_child_grade_for_order(NEW.child_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_order_child_grade() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_cart_child_grade ON public.cart_items;
CREATE TRIGGER guard_cart_child_grade
  BEFORE INSERT OR UPDATE OF child_id, menu_id, date ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_child_grade();

-- School orders are created directly, without a parent checkout. Existing
-- reservations and bank callbacks must remain readable and completable.
DROP TRIGGER IF EXISTS guard_school_order_child_grade ON public.reservations;
CREATE TRIGGER guard_school_order_child_grade
  BEFORE INSERT ON public.reservations
  FOR EACH ROW WHEN (NEW.created_by_school IS TRUE)
  EXECUTE FUNCTION public.guard_order_child_grade();

-- Recheck old baskets immediately before preparing a NEW payment. The current
-- implementation locks each child first. Retain its idempotent payment recovery,
-- prices, Morocco deadline, credit ledger and late bank completion behavior.
DO $migration$
DECLARE
  definition text;
  anchor text := '    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) i WHERE i->>''id''=ci.id::text';
  validation text := '    PERFORM public.assert_child_grade_for_order(ci.child_id);';
BEGIN
  SELECT pg_get_functiondef('public.prepare_meal_checkout(uuid,jsonb,numeric,jsonb)'::regprocedure)
    INTO definition;
  IF strpos(definition, validation) = 0 THEN
    IF strpos(definition, anchor) = 0
      OR strpos(definition, 'ORDER BY c.id FOR UPDATE OF c') = 0 THEN
      RAISE EXCEPTION 'Unexpected checkout definition, grade validation migration aborted';
    END IF;
    EXECUTE replace(definition, anchor, validation || E'\n' || anchor);
  END IF;
END;
$migration$;

COMMIT;
