/*
  Gestion des utilisateurs côté admin (page "Voir les utilisateurs")

  1. children.genre
     - Colonne `genre` (texte, nullable) : 'fille' | 'garcon'.
     - Permet le filtre fille/garçon dans l'aperçu des élèves d'une école.
     - Les enfants déjà créés restent NULL ("non renseigné") jusqu'à édition.

  2. Lecture admin sur les tables de liaison
     - L'admin (parents.is_admin = true) doit pouvoir lire
       `parent_school_affiliations` et `provider_school_access` pour afficher,
       dans les fiches détail, les écoles affiliées d'un parent, les écoles
       desservies par un prestataire et les prestataires liés à une école.
     - Ces 2 tables n'avaient aucune policy admin (lecture refusée jusqu'ici).

  Note : RLS est déjà activé sur ces tables (migrations de création).
*/

-- 1. Champ sexe sur les enfants ----------------------------------------------
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS genre text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'children_genre_check'
  ) THEN
    ALTER TABLE public.children
      ADD CONSTRAINT children_genre_check
      CHECK (genre IS NULL OR genre IN ('fille', 'garcon'));
  END IF;
END $$;

-- 2. Lecture admin sur parent_school_affiliations ----------------------------
DROP POLICY IF EXISTS "psa_select_admin" ON public.parent_school_affiliations;
CREATE POLICY "psa_select_admin"
  ON public.parent_school_affiliations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parents
      WHERE parents.user_id = auth.uid()
        AND parents.is_admin = true
    )
  );

-- 3. Lecture admin sur provider_school_access --------------------------------
DROP POLICY IF EXISTS "prov_access_select_admin" ON public.provider_school_access;
CREATE POLICY "prov_access_select_admin"
  ON public.provider_school_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parents
      WHERE parents.user_id = auth.uid()
        AND parents.is_admin = true
    )
  );
