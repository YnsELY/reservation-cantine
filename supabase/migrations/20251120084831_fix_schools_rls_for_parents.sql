/*
  # Fix Schools RLS for Parents

  1. Changes
    - Add policy to allow parents to view schools they are affiliated with
    - This enables parents to see school information when adding children
  
  2. Security
    - Parents can only see schools they have active affiliations with
    - Maintains data security while allowing necessary access
*/

CREATE POLICY "Parents can view affiliated schools"
  ON schools
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT school_id 
      FROM parent_school_affiliations 
      WHERE parent_id IN (
        SELECT id FROM parents WHERE user_id = auth.uid()
      )
      AND status = 'active'
    )
  );
