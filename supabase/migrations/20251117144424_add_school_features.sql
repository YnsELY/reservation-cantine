/*
  # Add School Features

  ## Summary
  This migration adds the necessary database structure to support school-level functionality,
  including providers (caterers), school access codes, and school-initiated orders.

  ## New Tables

  ### 1. providers
  - `id` (uuid, primary key) - Unique identifier for each provider/caterer
  - `name` (text) - Provider/caterer name
  - `description` (text) - Description of the provider
  - `contact_email` (text) - Contact email
  - `contact_phone` (text) - Contact phone
  - `address` (text) - Provider address
  - `created_at` (timestamptz) - Creation timestamp

  ### 2. school_providers
  - `id` (uuid, primary key) - Unique identifier
  - `school_id` (uuid) - Reference to school
  - `provider_id` (uuid) - Reference to provider
  - `active` (boolean) - Whether this provider relationship is active
  - `created_at` (timestamptz) - Creation timestamp

  ## Modified Tables

  ### schools
  - Add `access_code` (text, unique) - Unique code for parents to affiliate with school
  - Add `is_school_user` (boolean) - Flag to identify school admin accounts

  ### reservations
  - Add `created_by_school` (boolean) - Flag to indicate if order was created by school
  - Add `school_payment_pending` (boolean) - Flag to indicate if parent needs to pay for school order

  ## Security
  - RLS policies updated to support school users viewing their data
  - School users can create orders for any child in their school
  - Parents can see school-initiated orders for their children
*/

-- Create providers table
CREATE TABLE IF NOT EXISTS providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  contact_email text,
  contact_phone text,
  address text,
  created_at timestamptz DEFAULT now()
);

-- Create school_providers junction table
CREATE TABLE IF NOT EXISTS school_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE NOT NULL,
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(school_id, provider_id)
);

-- Add access_code to schools table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'access_code'
  ) THEN
    ALTER TABLE schools ADD COLUMN access_code text UNIQUE;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_access_code ON schools(access_code);
  END IF;
END $$;

-- Add is_school_user to schools table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'is_school_user'
  ) THEN
    ALTER TABLE schools ADD COLUMN is_school_user boolean DEFAULT false;
  END IF;
END $$;

-- Add created_by_school to reservations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reservations' AND column_name = 'created_by_school'
  ) THEN
    ALTER TABLE reservations ADD COLUMN created_by_school boolean DEFAULT false;
  END IF;
END $$;

-- Add school_payment_pending to reservations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reservations' AND column_name = 'school_payment_pending'
  ) THEN
    ALTER TABLE reservations ADD COLUMN school_payment_pending boolean DEFAULT false;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_school_providers_school_id ON school_providers(school_id);
CREATE INDEX IF NOT EXISTS idx_school_providers_provider_id ON school_providers(provider_id);
CREATE INDEX IF NOT EXISTS idx_reservations_created_by_school ON reservations(created_by_school);
CREATE INDEX IF NOT EXISTS idx_reservations_school_payment_pending ON reservations(school_payment_pending);

-- Enable Row Level Security on new tables
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_providers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for providers
CREATE POLICY "School users can view their providers"
  ON providers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM school_providers sp
      JOIN schools s ON s.id = sp.school_id
      WHERE sp.provider_id = providers.id
      AND s.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "School users can create providers"
  ON providers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM schools
      WHERE schools.access_code = current_setting('app.current_access_code', true)
      AND schools.is_school_user = true
    )
  );

CREATE POLICY "School users can update their providers"
  ON providers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM school_providers sp
      JOIN schools s ON s.id = sp.school_id
      WHERE sp.provider_id = providers.id
      AND s.access_code = current_setting('app.current_access_code', true)
    )
  );

-- RLS Policies for school_providers
CREATE POLICY "School users can view their provider relationships"
  ON school_providers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM schools
      WHERE schools.id = school_providers.school_id
      AND schools.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "School users can create provider relationships"
  ON school_providers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM schools
      WHERE schools.id = school_providers.school_id
      AND schools.access_code = current_setting('app.current_access_code', true)
      AND schools.is_school_user = true
    )
  );

CREATE POLICY "School users can update provider relationships"
  ON school_providers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM schools
      WHERE schools.id = school_providers.school_id
      AND schools.access_code = current_setting('app.current_access_code', true)
      AND schools.is_school_user = true
    )
  );

-- Update RLS policies for schools to allow school users to view their own school
DROP POLICY IF EXISTS "School users can view their school" ON schools;
CREATE POLICY "School users can view their school"
  ON schools FOR SELECT
  USING (
    access_code = current_setting('app.current_access_code', true)
  );

-- Update RLS policies for children to allow school users to view all children in their school
DROP POLICY IF EXISTS "School users can view children in their school" ON children;
CREATE POLICY "School users can view children in their school"
  ON children FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM schools
      WHERE schools.id = children.school_id
      AND schools.access_code = current_setting('app.current_access_code', true)
      AND schools.is_school_user = true
    )
  );

-- Update RLS policies for reservations to allow school users to create orders for children
DROP POLICY IF EXISTS "School users can create reservations for children" ON reservations;
CREATE POLICY "School users can create reservations for children"
  ON reservations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM children
      JOIN schools ON schools.id = children.school_id
      WHERE children.id = reservations.child_id
      AND schools.access_code = current_setting('app.current_access_code', true)
      AND schools.is_school_user = true
    )
  );

-- Update RLS policies for reservations to allow school users to view all orders
DROP POLICY IF EXISTS "School users can view reservations in their school" ON reservations;
CREATE POLICY "School users can view reservations in their school"
  ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children
      JOIN schools ON schools.id = children.school_id
      WHERE children.id = reservations.child_id
      AND schools.access_code = current_setting('app.current_access_code', true)
      AND schools.is_school_user = true
    )
  );

-- Update parent reservation policy to include school-initiated orders
DROP POLICY IF EXISTS "Parents can view own reservations" ON reservations;
CREATE POLICY "Parents can view own reservations"
  ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = reservations.parent_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
    OR
    EXISTS (
      SELECT 1 FROM children
      JOIN parents ON parents.id = children.parent_id
      WHERE children.id = reservations.child_id
      AND parents.access_code = current_setting('app.current_access_code', true)
      AND reservations.created_by_school = true
    )
  );

-- Function to generate unique school access codes
CREATE OR REPLACE FUNCTION generate_school_access_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  exists boolean;
BEGIN
  LOOP
    code := 'SCH-' || upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS(SELECT 1 FROM schools WHERE access_code = code) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN code;
END;
$$;
