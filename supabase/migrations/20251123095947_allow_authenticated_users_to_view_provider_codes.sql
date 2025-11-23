/*
  # Autoriser les utilisateurs authentifiés à voir les codes prestataire actifs

  1. Modifications de sécurité
    - Ajoute une politique permettant aux utilisateurs authentifiés de lire les codes actifs
    - Nécessaire car lors de l'inscription, l'utilisateur est déjà authentifié après signUp
*/

CREATE POLICY "Authenticated users can view active provider registration codes"
  ON provider_registration_codes
  FOR SELECT
  TO authenticated
  USING (is_active = true);
