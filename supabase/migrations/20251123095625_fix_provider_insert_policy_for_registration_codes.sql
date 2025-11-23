/*
  # Corriger la politique d'insertion pour les prestataires

  1. Modifications de sécurité
    - Supprime l'ancienne politique qui vérifie dans la table schools
    - Ajoute une nouvelle politique qui vérifie dans provider_registration_codes
    - Permet aux utilisateurs authentifiés d'insérer un provider avec un code valide
*/

DROP POLICY IF EXISTS "Anyone can insert provider with valid code" ON providers;
DROP POLICY IF EXISTS "School users can create providers" ON providers;

CREATE POLICY "Authenticated users can insert provider with valid code"
  ON providers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    registration_code IN (
      SELECT code 
      FROM provider_registration_codes 
      WHERE is_active = true
    )
  );
