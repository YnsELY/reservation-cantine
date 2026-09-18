-- Validate school-specific grades and keep a school transfer atomic with cart cleanup.
-- Existing reservations/payment records retain their original menu and school.
CREATE OR REPLACE FUNCTION public.validate_child_school_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  school_name text;
BEGIN
  SELECT name INTO school_name FROM public.schools WHERE id = NEW.school_id;
  IF school_name ~* '\mla[[:space:]-]+vertu\M'
     AND NULLIF(btrim(NEW.grade), '') IS NOT NULL
     AND btrim(NEW.grade) NOT IN (
       'Petite Section', 'Moyenne Section', 'Grande Section',
       'CP', 'CE1', 'CE2', 'CM1', 'CM2'
     ) THEN
    RAISE EXCEPTION 'La Vertu accueille uniquement les classes de maternelle et élémentaire, jusqu’au CM2.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    -- Parents may transfer only to a school with an active affiliation.
    -- Other authorized roles retain their existing permissions.
    IF EXISTS (SELECT 1 FROM public.parents WHERE id = NEW.parent_id AND user_id = auth.uid())
       AND NOT EXISTS (
         SELECT 1 FROM public.parent_school_affiliations
         WHERE parent_id = NEW.parent_id AND school_id = NEW.school_id AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'Ajoutez la nouvelle école avec son code d’accès avant de la sélectionner.';
    END IF;
    DELETE FROM public.cart_items WHERE child_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_child_school_change() FROM PUBLIC;
CREATE TRIGGER validate_child_school_change
BEFORE INSERT OR UPDATE OF school_id, grade ON public.children
FOR EACH ROW EXECUTE FUNCTION public.validate_child_school_change();

-- A reservation belongs to its menu's school, not the child's current school.
ALTER POLICY reservations_select_school ON public.reservations
USING (EXISTS (
  SELECT 1 FROM public.menus m
  WHERE m.id = reservations.menu_id AND m.school_id = public.current_school_id()
));
ALTER POLICY reservations_update_school ON public.reservations
USING (EXISTS (
  SELECT 1 FROM public.menus m
  WHERE m.id = reservations.menu_id AND m.school_id = public.current_school_id()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.menus m
  WHERE m.id = reservations.menu_id AND m.school_id = public.current_school_id()
));

-- Retain the identities needed to display an old school's existing orders.
-- This grants read access only; it does not enroll the child at the old school.
CREATE POLICY children_select_school_orders ON public.children
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.reservations r
  JOIN public.menus m ON m.id = r.menu_id
  WHERE r.child_id = children.id AND m.school_id = public.current_school_id()
));
CREATE POLICY parents_select_school_orders ON public.parents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.reservations r
  JOIN public.menus m ON m.id = r.menu_id
  WHERE r.parent_id = parents.id AND m.school_id = public.current_school_id()
));
