/*
  Désactivation des comptes prestataires (réservée à l'admin)

  1. providers.is_active (boolean, défaut true)
     - Un prestataire désactivé ne peut plus se connecter (blocage côté app,
       voir lib/startup.ts et app/auth.tsx).

  2. providers : policy UPDATE pour l'admin
     - L'admin peut basculer is_active (la table n'avait qu'une policy UPDATE
       réservée au propriétaire).

  3. provider_school_access : policy DELETE pour l'admin
     - À la désactivation, l'admin retire le prestataire de toutes les écoles
       partenaires ("disparition des affiliations").

  Réversible : réactiver remet is_active = true (les liens écoles devront être
  recréés via le code d'accès de l'école).
*/

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "providers_update_admin" ON public.providers;
CREATE POLICY "providers_update_admin"
  ON public.providers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.parents WHERE parents.user_id = auth.uid() AND parents.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.parents WHERE parents.user_id = auth.uid() AND parents.is_admin = true)
  );

DROP POLICY IF EXISTS "prov_access_delete_admin" ON public.provider_school_access;
CREATE POLICY "prov_access_delete_admin"
  ON public.provider_school_access FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.parents WHERE parents.user_id = auth.uid() AND parents.is_admin = true)
  );
