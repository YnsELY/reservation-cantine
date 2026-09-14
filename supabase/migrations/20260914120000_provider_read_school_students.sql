/*
  Liste minimale des élèves des écoles rattachées au prestataire connecté.

  Les RPC SECURITY DEFINER exposent uniquement les champs nécessaires à l'écran
  prestataire : identité de l'élève, école, classe et identité du parent. Les
  policies children/parents existantes restent donc limitées aux familles ayant
  déjà commandé un menu du prestataire et aucun champ privé supplémentaire
  (email, téléphone, code d'accès, date de naissance...) n'est rendu lisible.
*/

CREATE OR REPLACE FUNCTION public.get_provider_school_students()
RETURNS TABLE (
  id uuid,
  school_id uuid,
  first_name text,
  last_name text,
  grade text,
  parent_first_name text,
  parent_last_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT
    c.id,
    c.school_id,
    c.first_name,
    c.last_name,
    c.grade,
    parent.first_name AS parent_first_name,
    parent.last_name AS parent_last_name
  FROM providers provider
  JOIN provider_school_access access ON access.provider_id = provider.id
  JOIN children c ON c.school_id = access.school_id
  JOIN parents parent ON parent.id = c.parent_id
  WHERE provider.user_id = auth.uid()
    AND provider.is_active = true
  ORDER BY c.last_name, c.first_name;
$$;

CREATE OR REPLACE FUNCTION public.get_provider_school_student_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT count(DISTINCT c.id)
  FROM providers provider
  JOIN provider_school_access access ON access.provider_id = provider.id
  JOIN children c ON c.school_id = access.school_id
  WHERE provider.user_id = auth.uid()
    AND provider.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.get_provider_school_students() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_school_student_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_school_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_school_student_count() TO authenticated;
