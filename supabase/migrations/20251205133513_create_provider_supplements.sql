/*
  # Create provider supplements table

  1. New Tables
    - `provider_supplements`
      - `id` (uuid, primary key)
      - `provider_id` (uuid, references providers)
      - `school_id` (uuid, references schools)
      - `name` (text) - Name of the supplement
      - `description` (text) - Description of the supplement
      - `price` (numeric) - Price of the supplement
      - `available` (boolean) - Availability status
      - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS on `provider_supplements` table
    - Add policy for providers to manage their supplements
    - Add policy for schools to view available supplements
    - Add policy for parents to view supplements for their children's schools
*/

-- Create provider_supplements table
CREATE TABLE IF NOT EXISTS provider_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL DEFAULT 0,
  available boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_provider_supplements_provider_id ON provider_supplements(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_supplements_school_id ON provider_supplements(school_id);
CREATE INDEX IF NOT EXISTS idx_provider_supplements_available ON provider_supplements(available);

-- Enable RLS
ALTER TABLE provider_supplements ENABLE ROW LEVEL SECURITY;

-- Policy for providers to manage their own supplements
CREATE POLICY "Providers can manage their own supplements"
  ON provider_supplements
  FOR ALL
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );

-- Policy for schools to view supplements from their providers
CREATE POLICY "Schools can view supplements from their providers"
  ON provider_supplements
  FOR SELECT
  TO authenticated
  USING (
    available = true AND
    school_id IN (
      SELECT id FROM schools WHERE user_id = auth.uid()
    )
  );

-- Policy for parents to view supplements for their children's schools
CREATE POLICY "Parents can view supplements for their children's schools"
  ON provider_supplements
  FOR SELECT
  TO authenticated
  USING (
    available = true AND
    school_id IN (
      SELECT DISTINCT children.school_id
      FROM children
      JOIN parents ON children.parent_id = parents.id
      WHERE parents.user_id = auth.uid()
    )
  );

-- Policy for admins to manage all supplements
CREATE POLICY "Admins can manage all supplements"
  ON provider_supplements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents WHERE user_id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents WHERE user_id = auth.uid() AND is_admin = true
    )
  );
