/*
  # Add admin delete policy for school registration codes

  1. Changes
    - Add DELETE policy for admins on school_registration_codes table
  
  2. Security
    - Only admins (users with is_admin = true in parents table) can delete school registration codes
    - This allows admins to clean up unused registration codes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'school_registration_codes' 
    AND policyname = 'Admins can delete school registration codes'
  ) THEN
    CREATE POLICY "Admins can delete school registration codes"
      ON school_registration_codes
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM parents
          WHERE parents.user_id = auth.uid()
          AND parents.is_admin = true
        )
      );
  END IF;
END $$;
