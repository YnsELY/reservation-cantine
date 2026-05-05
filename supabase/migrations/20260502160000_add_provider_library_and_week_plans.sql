/*
  # Provider library and week planning

  1. New Tables
    - `provider_menu_library`
      Reusable provider menus, independent from school/date publication.
    - `provider_week_plans`
      Provider-side weekly planning header.
    - `provider_week_plan_days`
      School/day assignments pointing to library menus and enabled supplements.

  2. Changes
    - Add `library_menu_id` to `provider_supplements` for reusable menu-specific supplements.
    - Add source columns to published `menus` and copied `provider_supplements`.

  3. Parent compatibility
    - Parent-facing screens still read the existing `menus` table.
*/

CREATE TABLE IF NOT EXISTS provider_menu_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  meal_name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL DEFAULT 0,
  image_url text,
  card_color text DEFAULT '#FFE4E1',
  available boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_menu_library_provider_id ON provider_menu_library(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_menu_library_available ON provider_menu_library(available);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_supplements' AND column_name = 'library_menu_id'
  ) THEN
    ALTER TABLE provider_supplements
      ADD COLUMN library_menu_id uuid REFERENCES provider_menu_library(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_supplements' AND column_name = 'source_library_supplement_id'
  ) THEN
    ALTER TABLE provider_supplements
      ADD COLUMN source_library_supplement_id uuid REFERENCES provider_supplements(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menus' AND column_name = 'library_menu_id'
  ) THEN
    ALTER TABLE menus
      ADD COLUMN library_menu_id uuid REFERENCES provider_menu_library(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menus' AND column_name = 'week_start_date'
  ) THEN
    ALTER TABLE menus ADD COLUMN week_start_date date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_provider_supplements_library_menu_id ON provider_supplements(library_menu_id);
CREATE INDEX IF NOT EXISTS idx_provider_supplements_source_library_supplement_id ON provider_supplements(source_library_supplement_id);
CREATE INDEX IF NOT EXISTS idx_menus_library_menu_id ON menus(library_menu_id);
CREATE INDEX IF NOT EXISTS idx_menus_provider_week ON menus(provider_id, week_start_date);

CREATE TABLE IF NOT EXISTS provider_week_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  week_start_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS provider_week_plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_plan_id uuid REFERENCES provider_week_plans(id) ON DELETE CASCADE NOT NULL,
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  library_menu_ids uuid[] DEFAULT '{}',
  enabled_supplement_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(week_plan_id, school_id, date)
);

CREATE INDEX IF NOT EXISTS idx_provider_week_plans_provider_week ON provider_week_plans(provider_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_provider_week_plan_days_provider_date ON provider_week_plan_days(provider_id, date);
CREATE INDEX IF NOT EXISTS idx_provider_week_plan_days_school_date ON provider_week_plan_days(school_id, date);

ALTER TABLE provider_menu_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_week_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_week_plan_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can manage their own menu library" ON provider_menu_library;
CREATE POLICY "Providers can manage their own menu library"
  ON provider_menu_library
  FOR ALL
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Providers can manage their own week plans" ON provider_week_plans;
CREATE POLICY "Providers can manage their own week plans"
  ON provider_week_plans
  FOR ALL
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Providers can manage their own week plan days" ON provider_week_plan_days;
CREATE POLICY "Providers can manage their own week plan days"
  ON provider_week_plan_days
  FOR ALL
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );

INSERT INTO provider_menu_library (
  provider_id,
  meal_name,
  description,
  price,
  image_url,
  card_color,
  available
)
SELECT DISTINCT ON (
  provider_id,
  meal_name,
  COALESCE(description, ''),
  price,
  COALESCE(image_url, ''),
  COALESCE(card_color, '#FFE4E1')
)
  provider_id,
  meal_name,
  description,
  price,
  image_url,
  COALESCE(card_color, '#FFE4E1'),
  true
FROM menus
WHERE provider_id IS NOT NULL
ON CONFLICT DO NOTHING;
