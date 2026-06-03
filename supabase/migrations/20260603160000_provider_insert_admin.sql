/*
  Création de prestataires par l'admin (fix RLS INSERT sur providers)

  Problème
  --------
  La seule policy d'INSERT active sur `providers` exige un `registration_code`
  valide (flux d'auto-inscription prestataire) :

      WITH CHECK (registration_code IN
        (SELECT code FROM provider_registration_codes WHERE is_active = true))

  Or l'admin crée un compte prestataire via app/(admin)/create-provider.tsx :
  il fait un signUp sur un client isolé (sa session reste « admin »), puis
  insère la ligne providers avec la session admin, SANS registration_code et
  avec un user_id ≠ le sien. Aucune policy ne l'autorise →
  « new row violates row-level security policy for table "providers" ».

  La migration de désactivation (20260602130000) avait ajouté un
  `providers_update_admin` mais aucune policy d'INSERT pour l'admin.

  Fix
  ---
  Ajouter une policy d'INSERT réservée à l'admin (même pattern EXISTS(parents…)
  que providers_update_admin). L'INSERT passe si AU MOINS une policy permissive
  l'autorise : l'admin peut donc créer n'importe quel prestataire, tandis que la
  policy « valid code » reste en place pour l'auto-inscription.
*/

DROP POLICY IF EXISTS "providers_insert_admin" ON public.providers;
CREATE POLICY "providers_insert_admin"
  ON public.providers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.parents
      WHERE parents.user_id = auth.uid()
        AND parents.is_admin = true
    )
  );
