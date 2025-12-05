/*
  # Add supplements field to menus table

  1. Changes
    - Add `supplements` column to menus table
      - Type: uuid[] (array of supplement IDs)
      - Default: empty array
      - This will store the IDs of supplements associated with each menu

  2. Notes
    - This allows providers to associate multiple supplements with each menu
    - Supplements are from the provider_supplements table
*/

-- Add supplements column to menus table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menus' AND column_name = 'supplements'
  ) THEN
    ALTER TABLE menus ADD COLUMN supplements uuid[] DEFAULT '{}';
  END IF;
END $$;
