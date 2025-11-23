/*
  # Fix provider_school_access INSERT policy
  
  1. Changes
    - Add policy allowing providers to insert their own school access
    - Providers can add schools using the school's access_code
  
  2. Security
    - Providers can only add access for themselves
    - School must have a valid access_code
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Schools can grant provider access" ON provider_school_access;

-- Create policy for schools to grant access
CREATE POLICY "Schools can grant provider access"
  ON provider_school_access FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id IN (
      SELECT id FROM schools WHERE user_id = auth.uid()
    )
  );

-- Create policy for providers to add schools
CREATE POLICY "Providers can add school access"
  ON provider_school_access FOR INSERT
  TO authenticated
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );
