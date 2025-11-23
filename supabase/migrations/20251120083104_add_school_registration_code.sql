/*
  # Add School Registration Validation Code

  1. New Tables
    - `school_registration_codes`
      - `id` (uuid, primary key)
      - `code` (text, unique) - Le code de validation pour créer une école
      - `is_active` (boolean) - Si le code est actif ou non
      - `description` (text) - Description du code
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on `school_registration_codes` table
    - Add policy for public read access (to validate codes)
    
  3. Initial Data
    - Insert a default registration code: CREATESCHOOL2024
*/

CREATE TABLE IF NOT EXISTS school_registration_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE school_registration_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active registration codes"
  ON school_registration_codes
  FOR SELECT
  USING (is_active = true);

-- Insert default registration code
INSERT INTO school_registration_codes (code, description)
VALUES ('CREATESCHOOL2024', 'Code de validation par défaut pour créer une école')
ON CONFLICT (code) DO NOTHING;
