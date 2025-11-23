/*
  # Update Provider System for Authentication

  1. Changes to existing tables
    - Add `user_id` to providers table for authentication
    - Add `registration_code` to providers table
    - Add `email` and `company_name` to providers table if not exists
    - Add `provider_registration_code` to schools table
    - Add `provider_id` to menus table
  
  2. New Table
    - `provider_school_access` for managing provider-school relationships
  
  3. Security
    - Enable RLS on providers table
    - Add RLS policies for provider authentication
    - Add RLS policies for provider_school_access
    - Update menu policies to allow provider access
*/

-- Add columns to providers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE providers ADD COLUMN user_id uuid REFERENCES auth.users UNIQUE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'registration_code'
  ) THEN
    ALTER TABLE providers ADD COLUMN registration_code text UNIQUE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'email'
  ) THEN
    ALTER TABLE providers ADD COLUMN email text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'company_name'
  ) THEN
    ALTER TABLE providers ADD COLUMN company_name text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'phone'
  ) THEN
    ALTER TABLE providers ADD COLUMN phone text;
  END IF;
END $$;

-- Add provider_registration_code to schools table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'provider_registration_code'
  ) THEN
    ALTER TABLE schools ADD COLUMN provider_registration_code text;
  END IF;
END $$;

-- Add provider_id to menus table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menus' AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE menus ADD COLUMN provider_id uuid REFERENCES providers(id);
  END IF;
END $$;

-- Create provider_school_access table
CREATE TABLE IF NOT EXISTS provider_school_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE NOT NULL,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid REFERENCES auth.users,
  UNIQUE(provider_id, school_id)
);

ALTER TABLE provider_school_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies for providers table
DROP POLICY IF EXISTS "Providers can view own data" ON providers;
CREATE POLICY "Providers can view own data"
  ON providers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Providers can update own data" ON providers;
CREATE POLICY "Providers can update own data"
  ON providers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can insert provider with valid code" ON providers;
CREATE POLICY "Anyone can insert provider with valid code"
  ON providers FOR INSERT
  TO authenticated
  WITH CHECK (
    registration_code IN (
      SELECT provider_registration_code 
      FROM schools 
      WHERE provider_registration_code IS NOT NULL
    )
  );

-- RLS Policies for provider_school_access table
CREATE POLICY "Providers can view their school access"
  ON provider_school_access FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Schools can view their provider access"
  ON provider_school_access FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT id FROM schools WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Schools can grant provider access"
  ON provider_school_access FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id IN (
      SELECT id FROM schools WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Schools can revoke provider access"
  ON provider_school_access FOR DELETE
  TO authenticated
  USING (
    school_id IN (
      SELECT id FROM schools WHERE user_id = auth.uid()
    )
  );