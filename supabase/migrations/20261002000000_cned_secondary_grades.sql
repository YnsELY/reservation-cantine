-- CNED EIM accepts collège/lycée only. Enrollment and checkout use the same rule.
-- Existing paid reservations and payment completion remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_school_grade_allowed(p_school_name text, p_grade text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_school_name ~* '\mcned[[:space:]-]+eim\M' THEN
      coalesce(btrim(p_grade) IN ('6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'), false)
    WHEN p_school_name ~* '\mla[[:space:]-]+vertu\M' THEN
      NULLIF(btrim(p_grade), '') IS NULL OR btrim(p_grade) IN (
        'Petite Section', 'Moyenne Section', 'Grande Section', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'
      )
    ELSE true
  END;
$$;
REVOKE ALL ON FUNCTION public.is_school_grade_allowed(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_child_school_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  school_name text;
BEGIN
  SELECT name INTO school_name FROM public.schools WHERE id = NEW.school_id;
  IF NOT public.is_school_grade_allowed(school_name, NEW.grade) THEN
    IF school_name ~* '\mcned[[:space:]-]+eim\M' THEN
      RAISE EXCEPTION 'Le CNED EIM accueille uniquement le collège et le lycée. Sélectionnez une classe de la 6ème à la Terminale.';
    END IF;
    RAISE EXCEPTION 'La Vertu accueille uniquement les classes de maternelle et élémentaire, jusqu’au CM2.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    IF EXISTS (SELECT 1 FROM public.parents WHERE id = NEW.parent_id AND user_id = auth.uid())
       AND NOT EXISTS (
         SELECT 1 FROM public.parent_school_affiliations
         WHERE parent_id = NEW.parent_id AND school_id = NEW.school_id AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'Ajoutez la nouvelle école avec son code d’accès avant de la sélectionner.';
    END IF;
    DELETE FROM public.cart_items WHERE child_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_child_school_change() FROM PUBLIC, anon, authenticated;

-- The existing basket, new checkout and school-order guards call this function.
-- They must not prevent completion of a payment initiated before a transfer.
CREATE OR REPLACE FUNCTION public.assert_child_grade_for_order(p_child_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  school_name text;
  child_grade text;
BEGIN
  SELECT s.name, c.grade INTO school_name, child_grade
    FROM public.children c JOIN public.schools s ON s.id = c.school_id
    WHERE c.id = p_child_id;
  IF NOT public.is_school_grade_allowed(school_name, child_grade) THEN
    IF school_name ~* '\mcned[[:space:]-]+eim\M' THEN
      RAISE EXCEPTION 'Le CNED EIM accueille uniquement le collège et le lycée. Sélectionnez une classe de la 6ème à la Terminale.';
    END IF;
    RAISE EXCEPTION 'La classe de cet enfant ne correspond pas à La Vertu (maternelle à CM2). Vérifiez sa fiche et son école avant de commander.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_child_grade_for_order(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
