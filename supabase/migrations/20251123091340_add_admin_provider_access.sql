/*
  # Add Admin Access to Providers

  1. Changes
    - Add RLS policy to allow admins (parents with is_admin=true) to view all providers
  
  2. Security
    - Policy checks that the user is authenticated and has is_admin=true in parents table
*/

CREATE POLICY "Admins can view all providers"
  ON providers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.user_id = auth.uid()
      AND parents.is_admin = true
    )
  );
