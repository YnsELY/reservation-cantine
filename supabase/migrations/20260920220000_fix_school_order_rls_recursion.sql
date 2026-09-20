-- Keep historical school-order visibility without re-entering reservations RLS
-- while reservations_insert_school checks children. See 20260918120000.
-- Same school/child/parent predicates; only the recursive lookup is isolated.
BEGIN;

CREATE OR REPLACE FUNCTION public.school_can_read_child_orders(p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.reservations r
    JOIN public.menus m ON m.id = r.menu_id
    WHERE r.child_id = p_child_id
      AND m.school_id = public.current_school_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.school_can_read_parent_orders(p_parent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.reservations r
    JOIN public.menus m ON m.id = r.menu_id
    WHERE r.parent_id = p_parent_id
      AND m.school_id = public.current_school_id()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.school_can_read_child_orders(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.school_can_read_parent_orders(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_can_read_child_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_can_read_parent_orders(uuid) TO authenticated;

ALTER POLICY children_select_school_orders ON public.children
USING (public.school_can_read_child_orders(children.id));
ALTER POLICY parents_select_school_orders ON public.parents
USING (public.school_can_read_parent_orders(parents.id));

COMMIT;
