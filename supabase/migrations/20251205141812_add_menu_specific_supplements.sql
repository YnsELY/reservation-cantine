/*
  # Add menu-specific supplements support

  1. Changes
    - Add `menu_id` column to provider_supplements table
      - Type: uuid (nullable, references menus)
      - Default: null
      - When null: supplement is generic (available for all menus)
      - When set: supplement is specific to that menu only

  2. Notes
    - Generic supplements (menu_id = null) are available for all menus
    - Menu-specific supplements (menu_id != null) are only available for that specific menu
    - This allows providers to create both generic and menu-specific supplements
*/

-- Add menu_id column to provider_supplements table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_supplements' AND column_name = 'menu_id'
  ) THEN
    ALTER TABLE provider_supplements ADD COLUMN menu_id uuid REFERENCES menus(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_provider_supplements_menu_id ON provider_supplements(menu_id);
