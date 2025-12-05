/*
  # Fix provider supplements delete policy

  1. Changes
    - Drop the existing generic policy for providers
    - Create separate policies for SELECT, INSERT, UPDATE, and DELETE operations
    - Ensure providers can properly delete their own supplements

  2. Security
    - Providers can SELECT, INSERT, UPDATE, and DELETE their own supplements
    - Each operation has its own explicit policy for better control
*/

-- Drop the existing generic policy
DROP POLICY IF EXISTS "Providers can manage their own supplements" ON provider_supplements;

-- Create separate policies for each operation

-- Policy for providers to view their own supplements
CREATE POLICY "Providers can view their own supplements"
  ON provider_supplements
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );

-- Policy for providers to insert their own supplements
CREATE POLICY "Providers can insert their own supplements"
  ON provider_supplements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );

-- Policy for providers to update their own supplements
CREATE POLICY "Providers can update their own supplements"
  ON provider_supplements
  FOR UPDATE
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

-- Policy for providers to delete their own supplements
CREATE POLICY "Providers can delete their own supplements"
  ON provider_supplements
  FOR DELETE
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );
