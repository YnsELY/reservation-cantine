/*
  Mot de passe INITIAL des comptes prestataire & école, visible par l'admin
  (fiche « Voir les utilisateurs »).

  ⚠️ Stockage EN CLAIR, par choix produit. Pour limiter le risque, il est isolé
  dans cette table dédiée avec une RLS **admin uniquement** : on ne le met PAS
  dans providers/schools qui sont lisibles largement.

  Limites assumées :
  - Ne reflète que le mot de passe défini à la CRÉATION (faux si le compte l'a
    changé ensuite — impossible de relire le vrai mot de passe, hashé côté auth).
  - Renseigné uniquement pour les comptes créés APRÈS cette migration.
*/

CREATE TABLE IF NOT EXISTS public.managed_account_passwords (
  user_id uuid PRIMARY KEY,
  account_type text NOT NULL CHECK (account_type IN ('provider', 'school')),
  email text,
  temp_password text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.managed_account_passwords ENABLE ROW LEVEL SECURITY;

-- Lecture/écriture réservées à l'admin (parents.is_admin = true)
DROP POLICY IF EXISTS "macp_admin_all" ON public.managed_account_passwords;
CREATE POLICY "macp_admin_all"
  ON public.managed_account_passwords FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parents WHERE parents.user_id = auth.uid() AND parents.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.parents WHERE parents.user_id = auth.uid() AND parents.is_admin = true));
