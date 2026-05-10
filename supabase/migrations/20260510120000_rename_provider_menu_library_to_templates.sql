/*
  # Rename provider_menu_library → provider_menu_templates

  Aligns the schema with the live database where the table was renamed.
  Idempotent: only runs the rename if the old table still exists.
  Renames associated indexes and RLS policy so names stay consistent.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'provider_menu_library'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'provider_menu_templates'
  ) THEN
    ALTER TABLE provider_menu_library RENAME TO provider_menu_templates;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_provider_menu_library_provider_id'
  ) THEN
    ALTER INDEX idx_provider_menu_library_provider_id RENAME TO idx_provider_menu_templates_provider_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_provider_menu_library_available'
  ) THEN
    ALTER INDEX idx_provider_menu_library_available RENAME TO idx_provider_menu_templates_available;
  END IF;
END $$;

DROP POLICY IF EXISTS "Providers can manage their own menu library" ON provider_menu_templates;
CREATE POLICY "Providers can manage their own menu templates"
  ON provider_menu_templates
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
