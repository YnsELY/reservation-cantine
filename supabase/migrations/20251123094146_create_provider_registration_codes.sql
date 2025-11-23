/*
  # Create provider registration codes table

  1. New Tables
    - `provider_registration_codes`
      - `id` (uuid, primary key)
      - `code` (text, unique) - Code d'inscription pour créer un compte prestataire
      - `is_active` (boolean) - Indique si le code est actif
      - `description` (text) - Description du code
      - `created_at` (timestamptz) - Date de création

  2. Security
    - Enable RLS on `provider_registration_codes` table
    - Add policy for admins to manage codes

  3. Data
    - Insert default provider registration code
*/

CREATE TABLE IF NOT EXISTS provider_registration_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE provider_registration_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view provider registration codes"
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

CREATE POLICY "Admins can update provider registration codes"
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

INSERT INTO provider_registration_codes (code, description, is_active)
VALUES ('CREATEPROVIDER2024', 'Code de validation par défaut pour créer un compte prestataire', true)
ON CONFLICT (code) DO NOTHING;
