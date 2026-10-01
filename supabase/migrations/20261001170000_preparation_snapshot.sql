-- One database snapshot for the preparation sheet. SECURITY INVOKER preserves
-- the caller's existing row policies; aggregating once avoids the REST row cap.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_preparation_snapshot(p_menu_ids uuid[], p_date date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'generated_at', statement_timestamp(),
    'orders', coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'child_id', c.id,
      'child_name', nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''),
      'parent_name', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'school_id', s.id,
      'school_name', s.name,
      'grade', c.grade,
      'genre', c.genre,
      'allergies', c.allergies,
      'dietary_restrictions', c.dietary_restrictions,
      'supplements', r.supplements,
      'annotations', r.annotations
    ) ORDER BY r.created_at, r.id), '[]'::jsonb)
  )
  FROM public.reservations r
  LEFT JOIN public.menus m ON m.id = r.menu_id
  LEFT JOIN public.schools s ON s.id = m.school_id
  LEFT JOIN public.children c ON c.id = r.child_id
  LEFT JOIN public.parents p ON p.id = r.parent_id
  WHERE r.menu_id = ANY(p_menu_ids) AND r.date = p_date
    AND r.payment_status IN ('paid', 'pending');
$function$;

REVOKE ALL ON FUNCTION public.get_preparation_snapshot(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_preparation_snapshot(uuid[], date) TO authenticated, service_role;
COMMIT;
