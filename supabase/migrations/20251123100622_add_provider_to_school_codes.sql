/*
  # Ajouter la référence au prestataire pour les codes d'inscription école

  1. Modifications
    - Ajoute la colonne `provider_user_id` à `school_registration_codes`
    - Met à jour les politiques RLS pour permettre aux prestataires de gérer leurs codes

  2. Sécurité
    - Les prestataires peuvent créer et gérer leurs propres codes
    - Les utilisateurs authentifiés peuvent voir les codes actifs (pour l'inscription)
*/

-- Ajouter la colonne provider_user_id si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'school_registration_codes' AND column_name = 'provider_user_id'
  ) THEN
    ALTER TABLE school_registration_codes 
    ADD COLUMN provider_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Anyone can view active school registration codes" ON school_registration_codes;

-- Politique pour permettre aux utilisateurs authentifiés de voir les codes actifs
DROP POLICY IF EXISTS "Authenticated users can view active school registration codes" ON school_registration_codes;
CREATE POLICY "Authenticated users can view active school registration codes"
  ON school_registration_codes
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Politique pour permettre aux utilisateurs anonymes de voir les codes actifs
DROP POLICY IF EXISTS "Anonymous users can view active school registration codes" ON school_registration_codes;
CREATE POLICY "Anonymous users can view active school registration codes"
  ON school_registration_codes
  FOR SELECT
  TO anon
  USING (is_active = true);

-- Politique pour permettre aux prestataires de voir leurs propres codes
DROP POLICY IF EXISTS "Providers can view their own school registration codes" ON school_registration_codes;
CREATE POLICY "Providers can view their own school registration codes"
  ON school_registration_codes
  FOR SELECT
  TO authenticated
  USING (provider_user_id = auth.uid());

-- Politique pour permettre aux prestataires de créer des codes
DROP POLICY IF EXISTS "Providers can create school registration codes" ON school_registration_codes;
CREATE POLICY "Providers can create school registration codes"
  ON school_registration_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    provider_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM providers WHERE user_id = auth.uid()
    )
  );

-- Politique pour permettre aux prestataires de mettre à jour leurs propres codes
DROP POLICY IF EXISTS "Providers can update their own school registration codes" ON school_registration_codes;
CREATE POLICY "Providers can update their own school registration codes"
  ON school_registration_codes
  FOR UPDATE
  TO authenticated
  USING (provider_user_id = auth.uid())
  WITH CHECK (provider_user_id = auth.uid());

-- Politique pour permettre aux admins de voir tous les codes
DROP POLICY IF EXISTS "Admins can view all school registration codes" ON school_registration_codes;
CREATE POLICY "Admins can view all school registration codes"
  ON school_registration_codes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.user_id = auth.uid()
      AND parents.is_admin = true
    )
  );

-- Politique pour permettre aux admins de mettre à jour tous les codes
DROP POLICY IF EXISTS "Admins can update all school registration codes" ON school_registration_codes;
CREATE POLICY "Admins can update all school registration codes"
  ON school_registration_codes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.user_id = auth.uid()
      AND parents.is_admin = true
    )
  );

-- Créer des index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_school_registration_codes_code ON school_registration_codes(code);
CREATE INDEX IF NOT EXISTS idx_school_registration_codes_provider_user_id ON school_registration_codes(provider_user_id);
CREATE INDEX IF NOT EXISTS idx_school_registration_codes_is_active ON school_registration_codes(is_active);
