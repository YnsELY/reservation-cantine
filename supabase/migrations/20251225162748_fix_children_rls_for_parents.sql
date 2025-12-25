/*
  # Fix Children Table RLS for Parents

  1. Changes
    - Add SELECT policy for parents to view their own children
    - Add INSERT policy for parents to add their own children
    - Add UPDATE policy for parents to update their own children
    - Add DELETE policy for parents to delete their own children
  
  2. Security
    - Parents can only access children linked to their parent record
    - Authentication is verified via auth.uid() matching parent.user_id
*/

-- Allow parents to view their own children
CREATE POLICY "Parents can view own children"
  ON children
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = children.parent_id
      AND parents.user_id = auth.uid()
    )
  );

-- Allow parents to insert their own children
CREATE POLICY "Parents can insert own children"
  ON children
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = children.parent_id
      AND parents.user_id = auth.uid()
    )
  );

-- Allow parents to update their own children
CREATE POLICY "Parents can update own children"
  ON children
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = children.parent_id
      AND parents.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = children.parent_id
      AND parents.user_id = auth.uid()
    )
  );

-- Allow parents to delete their own children
CREATE POLICY "Parents can delete own children"
  ON children
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = children.parent_id
      AND parents.user_id = auth.uid()
    )
  );
