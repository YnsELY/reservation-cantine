/*
  # Autoriser l'accès public aux codes d'inscription prestataire

  1. Modifications de sécurité
    - Ajoute une politique permettant aux utilisateurs non-authentifiés de lire les codes actifs
    - Nécessaire pour la validation lors de l'inscription d'un nouveau prestataire
*/

CREATE POLICY "Anyone can view active provider registration codes"
  ON provider_registration_codes
  FOR SELECT
  TO anon
  USING (is_active = true);
