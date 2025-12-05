/*
  # Ajouter la politique INSERT pour les admins sur school_registration_codes

  1. Modifications
    - Ajoute une politique INSERT pour permettre aux admins de créer des codes d'accès école
    - Les admins peuvent créer des codes avec ou sans provider_user_id

  2. Sécurité
    - Seuls les utilisateurs avec is_admin = true peuvent insérer des codes
*/

-- Supprimer l'ancienne politique si elle existe
DROP POLICY IF EXISTS "Admins can create school registration codes" ON school_registration_codes;

-- Permettre aux admins de créer des codes d'accès école
CREATE POLICY "Admins can create school registration codes"
  ON school_registration_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.user_id = auth.uid()
      AND parents.is_admin = true
    )
  );
