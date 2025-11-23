/*
  # Create cart table for temporary order storage

  1. New Tables
    - `cart_items`
      - `id` (uuid, primary key) - Unique identifier for cart item
      - `parent_id` (uuid, foreign key) - Reference to parent
      - `child_id` (uuid, foreign key) - Reference to child
      - `menu_id` (uuid, foreign key) - Reference to menu
      - `date` (date) - Date of the meal
      - `supplements` (jsonb) - Array of selected supplements
      - `annotations` (text) - Special instructions
      - `total_price` (numeric) - Total price for this cart item
      - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS on `cart_items` table
    - Add policy for parents to manage their own cart items
*/

CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  menu_id uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  date date NOT NULL,
  supplements jsonb DEFAULT '[]'::jsonb,
  annotations text,
  total_price numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view their own cart items"
  ON cart_items
  FOR SELECT
  USING (parent_id IN (
    SELECT id FROM parents WHERE access_code = current_setting('app.current_parent_code', true)
  ));

CREATE POLICY "Parents can insert their own cart items"
  ON cart_items
  FOR INSERT
  WITH CHECK (parent_id IN (
    SELECT id FROM parents WHERE access_code = current_setting('app.current_parent_code', true)
  ));

CREATE POLICY "Parents can delete their own cart items"
  ON cart_items
  FOR DELETE
  USING (parent_id IN (
    SELECT id FROM parents WHERE access_code = current_setting('app.current_parent_code', true)
  ));

CREATE INDEX IF NOT EXISTS idx_cart_items_parent_id ON cart_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_created_at ON cart_items(created_at);