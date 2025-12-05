/*
  # Add birth date to children table

  1. Changes
    - Add `date_of_birth` column to `children` table
      - Type: date
      - Nullable to support existing records
      - No default value as it should be provided when known
  
  2. Notes
    - Existing children records will have NULL for date_of_birth
    - The application will calculate age automatically from this field
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'children' AND column_name = 'date_of_birth'
  ) THEN
    ALTER TABLE children ADD COLUMN date_of_birth date;
  END IF;
END $$;