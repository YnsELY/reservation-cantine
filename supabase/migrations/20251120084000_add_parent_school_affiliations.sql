/*
  # Add Parent School Affiliations

  1. New Tables
    - `parent_school_affiliations`
      - `id` (uuid, primary key)
      - `parent_id` (uuid, foreign key to parents)
      - `school_id` (uuid, foreign key to schools)
      - `status` (text) - active, pending, rejected
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `parent_school_affiliations` table
    - Add policy for parents to read their own affiliations
    
  3. Notes
    - When a parent adds a school via access code, an affiliation is created
    - Only affiliated schools should be visible when adding children
*/

CREATE TABLE IF NOT EXISTS parent_school_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(parent_id, school_id)
);

ALTER TABLE parent_school_affiliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view their own affiliations"
  ON parent_school_affiliations
  FOR SELECT
  TO authenticated
  USING (
    parent_id IN (
      SELECT id FROM parents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Parents can insert their own affiliations"
  ON parent_school_affiliations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    parent_id IN (
      SELECT id FROM parents WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_parent_school_affiliations_parent_id 
  ON parent_school_affiliations(parent_id);

CREATE INDEX IF NOT EXISTS idx_parent_school_affiliations_school_id 
  ON parent_school_affiliations(school_id);
