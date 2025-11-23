/*
  # School Meal Reservation System - Complete Database Schema

  ## Overview
  This migration creates a complete database structure for a school meal reservation system
  that allows parents to reserve meals for their children and enables school administrators
  to manage orders, menus, and logistics.

  ## Tables Created

  ### 1. schools
  - `id` (uuid, primary key) - Unique identifier for each school
  - `name` (text) - School name
  - `address` (text) - School address
  - `contact_email` (text) - Contact email for the school
  - `contact_phone` (text) - Contact phone number
  - `created_at` (timestamptz) - Creation timestamp

  ### 2. parents
  - `id` (uuid, primary key) - Unique identifier for each parent
  - `access_code` (text, unique) - Unique 8-character code for authentication
  - `email` (text) - Parent email address
  - `phone` (text) - Parent phone number
  - `first_name` (text) - Parent first name
  - `last_name` (text) - Parent last name
  - `is_admin` (boolean) - Flag for administrator access
  - `school_id` (uuid) - Reference to assigned school (for admins)
  - `created_at` (timestamptz) - Creation timestamp

  ### 3. children
  - `id` (uuid, primary key) - Unique identifier for each child
  - `parent_id` (uuid) - Reference to parent
  - `school_id` (uuid) - Reference to school
  - `first_name` (text) - Child first name
  - `last_name` (text) - Child last name
  - `grade` (text) - Grade level
  - `allergies` (text[]) - Array of allergies
  - `dietary_restrictions` (text[]) - Array of dietary restrictions
  - `created_at` (timestamptz) - Creation timestamp

  ### 4. menus
  - `id` (uuid, primary key) - Unique identifier for each menu
  - `school_id` (uuid) - Reference to school
  - `date` (date) - Date of the menu
  - `meal_name` (text) - Name of the meal
  - `description` (text) - Detailed description
  - `price` (numeric) - Base price for the meal
  - `allergens` (text[]) - Array of allergens present
  - `image_url` (text) - URL to meal image
  - `available` (boolean) - Availability status
  - `created_at` (timestamptz) - Creation timestamp

  ### 5. supplements
  - `id` (uuid, primary key) - Unique identifier for each supplement
  - `school_id` (uuid) - Reference to school
  - `name` (text) - Supplement name (e.g., "Dessert", "Drink")
  - `description` (text) - Description
  - `price` (numeric) - Price for the supplement
  - `available` (boolean) - Availability status
  - `created_at` (timestamptz) - Creation timestamp

  ### 6. reservations
  - `id` (uuid, primary key) - Unique identifier for each reservation
  - `child_id` (uuid) - Reference to child
  - `menu_id` (uuid) - Reference to menu
  - `parent_id` (uuid) - Reference to parent who made reservation
  - `date` (date) - Date of the reservation
  - `supplements` (jsonb) - Array of supplement IDs
  - `annotations` (text) - Special notes or requests
  - `total_price` (numeric) - Total calculated price
  - `payment_status` (text) - Status: pending, paid, cancelled
  - `payment_intent_id` (text) - Stripe payment intent ID
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Parents can only view/manage their own data
  - Admins can view/manage data for their assigned school
  - Public access denied by default

  ## Indexes
  - Performance indexes on foreign keys and frequently queried fields
  - Unique indexes on access codes and date-based queries
*/

-- Create schools table
CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  contact_email text,
  contact_phone text,
  created_at timestamptz DEFAULT now()
);

-- Create parents table
CREATE TABLE IF NOT EXISTS parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code text UNIQUE NOT NULL,
  email text,
  phone text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  is_admin boolean DEFAULT false,
  school_id uuid REFERENCES schools(id),
  created_at timestamptz DEFAULT now()
);

-- Create children table
CREATE TABLE IF NOT EXISTS children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES parents(id) ON DELETE CASCADE NOT NULL,
  school_id uuid REFERENCES schools(id) NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  grade text,
  allergies text[] DEFAULT '{}',
  dietary_restrictions text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create menus table
CREATE TABLE IF NOT EXISTS menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) NOT NULL,
  date date NOT NULL,
  meal_name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL DEFAULT 0,
  allergens text[] DEFAULT '{}',
  image_url text,
  available boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create supplements table
CREATE TABLE IF NOT EXISTS supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL DEFAULT 0,
  available boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid REFERENCES children(id) ON DELETE CASCADE NOT NULL,
  menu_id uuid REFERENCES menus(id) NOT NULL,
  parent_id uuid REFERENCES parents(id) NOT NULL,
  date date NOT NULL,
  supplements jsonb DEFAULT '[]',
  annotations text,
  total_price numeric(10, 2) NOT NULL,
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'cancelled')),
  payment_intent_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_parents_access_code ON parents(access_code);
CREATE INDEX IF NOT EXISTS idx_parents_school_id ON parents(school_id);
CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_id);
CREATE INDEX IF NOT EXISTS idx_children_school_id ON children(school_id);
CREATE INDEX IF NOT EXISTS idx_menus_school_date ON menus(school_id, date);
CREATE INDEX IF NOT EXISTS idx_supplements_school_id ON supplements(school_id);
CREATE INDEX IF NOT EXISTS idx_reservations_child_id ON reservations(child_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_menu_id ON reservations(menu_id);
CREATE INDEX IF NOT EXISTS idx_reservations_parent_id ON reservations(parent_id);

-- Enable Row Level Security
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for schools
CREATE POLICY "Admins can view their assigned school"
  ON schools FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.school_id = schools.id
      AND parents.access_code = current_setting('app.current_access_code', true)
      AND parents.is_admin = true
    )
  );

-- RLS Policies for parents
CREATE POLICY "Parents can view own profile"
  ON parents FOR SELECT
  USING (access_code = current_setting('app.current_access_code', true));

CREATE POLICY "Parents can update own profile"
  ON parents FOR UPDATE
  USING (access_code = current_setting('app.current_access_code', true))
  WITH CHECK (access_code = current_setting('app.current_access_code', true));

CREATE POLICY "Admins can view all parents in their school"
  ON parents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parents p
      WHERE p.school_id = parents.school_id
      AND p.access_code = current_setting('app.current_access_code', true)
      AND p.is_admin = true
    )
  );

CREATE POLICY "Admins can create parents"
  ON parents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents p
      WHERE p.school_id = parents.school_id
      AND p.access_code = current_setting('app.current_access_code', true)
      AND p.is_admin = true
    )
  );

CREATE POLICY "Admins can update parents in their school"
  ON parents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM parents p
      WHERE p.school_id = parents.school_id
      AND p.access_code = current_setting('app.current_access_code', true)
      AND p.is_admin = true
    )
  );

-- RLS Policies for children
CREATE POLICY "Parents can view own children"
  ON children FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = children.parent_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "Parents can create own children"
  ON children FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = children.parent_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "Parents can update own children"
  ON children FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = children.parent_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "Admins can view all children in their school"
  ON children FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.school_id = children.school_id
      AND parents.access_code = current_setting('app.current_access_code', true)
      AND parents.is_admin = true
    )
  );

-- RLS Policies for menus
CREATE POLICY "Parents can view menus for their children's school"
  ON menus FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children
      JOIN parents ON parents.id = children.parent_id
      WHERE children.school_id = menus.school_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "Admins can manage menus for their school"
  ON menus FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.school_id = menus.school_id
      AND parents.access_code = current_setting('app.current_access_code', true)
      AND parents.is_admin = true
    )
  );

-- RLS Policies for supplements
CREATE POLICY "Parents can view supplements for their children's school"
  ON supplements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children
      JOIN parents ON parents.id = children.parent_id
      WHERE children.school_id = supplements.school_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "Admins can manage supplements for their school"
  ON supplements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.school_id = supplements.school_id
      AND parents.access_code = current_setting('app.current_access_code', true)
      AND parents.is_admin = true
    )
  );

-- RLS Policies for reservations
CREATE POLICY "Parents can view own reservations"
  ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = reservations.parent_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "Parents can create reservations for own children"
  ON reservations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM children
      JOIN parents ON parents.id = children.parent_id
      WHERE children.id = reservations.child_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "Parents can update own reservations"
  ON reservations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM parents
      WHERE parents.id = reservations.parent_id
      AND parents.access_code = current_setting('app.current_access_code', true)
    )
  );

CREATE POLICY "Admins can view all reservations for their school"
  ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children
      JOIN parents p ON p.school_id = children.school_id
      WHERE children.id = reservations.child_id
      AND p.access_code = current_setting('app.current_access_code', true)
      AND p.is_admin = true
    )
  );

-- Create function to generate unique access codes
CREATE OR REPLACE FUNCTION generate_access_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  exists boolean;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM parents WHERE access_code = code) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN code;
END;
$$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for reservations updated_at
CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
