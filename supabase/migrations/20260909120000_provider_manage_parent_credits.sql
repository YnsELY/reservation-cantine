/*
  Permet aux prestataires de gérer les cagnottes des parents ayant au moins
  un enfant dans l'une de leurs écoles partenaires.

  La cagnotte reste rattachée au parent (modèle historique). Si un parent a
  des enfants dans plusieurs écoles, chaque prestataire relié à l'une de ces
  écoles peut donc gérer la même cagnotte globale.

  Toutes les vérifications de périmètre sont faites côté PostgreSQL : masquer
  l'écran dans l'application ne constitue pas une autorisation suffisante.
*/

CREATE OR REPLACE FUNCTION public.provider_can_manage_parent(p_parent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.providers pr
    JOIN public.provider_school_access psa ON psa.provider_id = pr.id
    JOIN public.children c ON c.school_id = psa.school_id
    WHERE pr.user_id = auth.uid()
      AND pr.is_active = true
      AND c.parent_id = p_parent_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provider_can_manage_parent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_can_manage_parent(uuid) TO authenticated;

-- Liste minimale utilisée par l'écran prestataire. La fonction évite
-- d'élargir la lecture générale de la table children.
CREATE OR REPLACE FUNCTION public.provider_managed_parents()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  children_names text[],
  school_names text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    pa.id,
    pa.first_name,
    pa.last_name,
    pa.email,
    ARRAY_AGG(
      DISTINCT NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), '')
    ) FILTER (
      WHERE NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), '') IS NOT NULL
    ) AS children_names,
    ARRAY_AGG(DISTINCT s.name ORDER BY s.name) AS school_names
  FROM public.providers pr
  JOIN public.provider_school_access psa ON psa.provider_id = pr.id
  JOIN public.schools s ON s.id = psa.school_id
  JOIN public.children c ON c.school_id = s.id
  JOIN public.parents pa ON pa.id = c.parent_id
  WHERE pr.user_id = auth.uid()
    AND pr.is_active = true
  GROUP BY pa.id, pa.first_name, pa.last_name, pa.email
  ORDER BY pa.last_name, pa.first_name;
$$;

REVOKE ALL ON FUNCTION public.provider_managed_parents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_managed_parents() TO authenticated;

-- Le prestataire voit et gère uniquement les crédits des parents appartenant
-- au périmètre calculé ci-dessus. Les policies parent/admin existantes restent
-- en place et se combinent avec celles-ci.
DROP POLICY IF EXISTS "parent_credits_select_provider" ON public.parent_credits;
CREATE POLICY "parent_credits_select_provider"
  ON public.parent_credits FOR SELECT
  TO authenticated
  USING (public.provider_can_manage_parent(parent_id));

DROP POLICY IF EXISTS "parent_credits_insert_provider" ON public.parent_credits;
CREATE POLICY "parent_credits_insert_provider"
  ON public.parent_credits FOR INSERT
  TO authenticated
  WITH CHECK (public.provider_can_manage_parent(parent_id));

DROP POLICY IF EXISTS "parent_credits_update_provider" ON public.parent_credits;
CREATE POLICY "parent_credits_update_provider"
  ON public.parent_credits FOR UPDATE
  TO authenticated
  USING (public.provider_can_manage_parent(parent_id))
  WITH CHECK (public.provider_can_manage_parent(parent_id));

DROP POLICY IF EXISTS "parent_credits_delete_provider" ON public.parent_credits;
CREATE POLICY "parent_credits_delete_provider"
  ON public.parent_credits FOR DELETE
  TO authenticated
  USING (public.provider_can_manage_parent(parent_id));
