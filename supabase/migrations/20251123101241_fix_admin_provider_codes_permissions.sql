/*
  # Correction des permissions RLS pour les codes d'accès prestataire

  1. Modifications
    - Permet aux admins de créer des codes d'accès prestataire
    - Permet aux admins de voir tous les codes
    - Permet aux admins de mettre à jour tous les codes

  2. Sécurité
    - Seuls les admins peuvent créer et gérer les codes prestataires
    - Les utilisateurs authentifiés peuvent voir les codes actifs (pour l'inscription)
*/

-- Supprimer les anciennes politiques admin si elles existent
DROP POLICY IF EXISTS "Admins can view all provider registration codes" ON provider_registration_codes;
DROP POLICY IF EXISTS "Admins can update all provider registration codes" ON provider_registration_codes;
DROP POLICY IF EXISTS "Admins can create provider registration codes" ON provider_registration_codes;

-- Permettre aux admins de voir tous les codes
CREATE POLICY "Admins can view all provider registration codes"
  ON provider_registration_codes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.user_id = auth.uid()
      AND parents.is_admin = true
    )
  );

-- Permettre aux admins de créer des codes
CREATE POLICY "Admins can create provider registration codes"
  ON provider_registration_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.user_id = auth.uid()
      AND parents.is_admin = true
    )
  );

-- Permettre aux admins de mettre à jour les codes
CREATE POLICY "Admins can update all provider registration codes"
  ON provider_registration_codes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.user_id = auth.uid()
      AND parents.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.user_id = auth.uid()
      AND parents.is_admin = true
    )
  );
