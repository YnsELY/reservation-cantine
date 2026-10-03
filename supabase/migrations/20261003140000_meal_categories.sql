-- Snackerie is a category of the existing meal, never a parallel ordering system.
BEGIN;

ALTER TABLE public.provider_menu_library
  ADD COLUMN IF NOT EXISTS meal_category text NOT NULL DEFAULT 'classic'
  CHECK (meal_category IN ('classic', 'snack'));
ALTER TABLE public.menus
  ADD COLUMN IF NOT EXISTS meal_category text NOT NULL DEFAULT 'classic'
  CHECK (meal_category IN ('classic', 'snack'));

-- Read the library at publication time, including publications from old clients.
-- Later library edits do not reclassify already-published or purchased meals.
CREATE OR REPLACE FUNCTION public.set_published_meal_category()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE category text;
BEGIN
  IF NEW.library_menu_id IS NOT NULL THEN
    SELECT l.meal_category INTO category FROM public.provider_menu_library l
      WHERE l.id = NEW.library_menu_id AND l.provider_id = NEW.provider_id;
    IF category IS NULL THEN
      RAISE EXCEPTION 'Repas de bibliothèque inaccessible pour ce prestataire.' USING ERRCODE = '23514';
    END IF;
    NEW.meal_category := category;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS set_published_meal_category ON public.menus;
CREATE TRIGGER set_published_meal_category
  BEFORE INSERT OR UPDATE OF library_menu_id ON public.menus
  FOR EACH ROW EXECUTE FUNCTION public.set_published_meal_category();

-- Aggregation in PostgreSQL avoids the REST row cap. Existing reservation/menu
-- policies still apply and no additional student identity fields are exposed.
CREATE OR REPLACE FUNCTION public.get_provider_student_meal_counts(p_provider_id uuid, p_date date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(counts) ORDER BY counts.child_id), '[]'::jsonb)
  FROM (
    SELECT r.child_id,
      count(*) FILTER (WHERE m.meal_category = 'classic') AS classic_count,
      count(*) FILTER (WHERE m.meal_category = 'snack') AS snack_count
    FROM public.reservations r
    JOIN public.menus m ON m.id = r.menu_id
    WHERE m.provider_id = p_provider_id AND r.date = p_date
      AND r.payment_status IN ('paid', 'pending')
    GROUP BY r.child_id
  ) counts;
$$;
REVOKE ALL ON FUNCTION public.get_provider_student_meal_counts(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_student_meal_counts(uuid, date) TO authenticated, service_role;

-- The preparation sheet and exports get their category from the purchased meal,
-- never from a route parameter or the current library entry.
CREATE OR REPLACE FUNCTION public.get_preparation_snapshot(p_menu_ids uuid[], p_date date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'generated_at', statement_timestamp(),
    'orders', coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'child_id', c.id,
      'child_name', nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''),
      'parent_name', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'school_id', s.id, 'school_name', s.name,
      'grade', c.grade, 'genre', c.genre, 'allergies', c.allergies,
      'dietary_restrictions', c.dietary_restrictions,
      'supplements', r.supplements, 'annotations', r.annotations,
      'meal_name', m.meal_name, 'meal_category', m.meal_category
    ) ORDER BY m.meal_category, r.created_at, r.id), '[]'::jsonb)
  )
  FROM public.reservations r
  LEFT JOIN public.menus m ON m.id = r.menu_id
  LEFT JOIN public.schools s ON s.id = m.school_id
  LEFT JOIN public.children c ON c.id = r.child_id
  LEFT JOIN public.parents p ON p.id = r.parent_id
  WHERE r.menu_id = ANY(p_menu_ids) AND r.date = p_date
    AND r.payment_status IN ('paid', 'pending');
$$;
REVOKE ALL ON FUNCTION public.get_preparation_snapshot(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_preparation_snapshot(uuid[], date) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
