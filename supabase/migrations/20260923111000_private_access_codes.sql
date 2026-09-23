BEGIN;
-- Codes are verified server-side, never enumerable by an unauthenticated caller.
DROP POLICY IF EXISTS "Anyone can view active provider registration codes" ON public.provider_registration_codes;
DROP POLICY IF EXISTS "Authenticated users can view active provider registration codes" ON public.provider_registration_codes;
DROP POLICY IF EXISTS "Anonymous users can view active school registration codes" ON public.school_registration_codes;
DROP POLICY IF EXISTS "Anyone can read active registration codes" ON public.school_registration_codes;
DROP POLICY IF EXISTS "Authenticated users can view active school registration codes" ON public.school_registration_codes;
DROP POLICY IF EXISTS "Authenticated users can view active parent codes" ON public.parent_registration_codes;
REVOKE ALL ON public.provider_registration_codes, public.school_registration_codes, public.parent_registration_codes FROM anon;
-- Preserve SELECT * for installed mobile clients, but move secrets out of the
-- public school row. Older clients retain names, calendars and school joins.
CREATE TABLE public.school_access_secrets (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 access_code text UNIQUE, provider_registration_code text
);
ALTER TABLE public.school_access_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_access_secrets FROM PUBLIC,anon,authenticated;
INSERT INTO public.school_access_secrets(school_id,access_code,provider_registration_code)
 SELECT id,access_code,provider_registration_code FROM public.schools;
UPDATE public.schools SET access_code=NULL,provider_registration_code=NULL;
REVOKE SELECT ON public.schools FROM anon;
CREATE OR REPLACE FUNCTION public.store_private_school_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.access_code IS NOT NULL OR NEW.provider_registration_code IS NOT NULL THEN
   INSERT INTO public.school_access_secrets(school_id,access_code,provider_registration_code)
     VALUES(NEW.id,NEW.access_code,NEW.provider_registration_code)
   ON CONFLICT(school_id) DO UPDATE SET
     access_code=coalesce(EXCLUDED.access_code,school_access_secrets.access_code),
     provider_registration_code=coalesce(EXCLUDED.provider_registration_code,school_access_secrets.provider_registration_code);
 END IF;
 NEW.access_code := NULL;
 NEW.provider_registration_code := NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER store_private_school_codes BEFORE INSERT OR UPDATE ON public.schools
 FOR EACH ROW EXECUTE FUNCTION public.store_private_school_codes();
DROP POLICY IF EXISTS schools_select_anon ON public.schools;
DROP POLICY IF EXISTS "Providers can add school access" ON public.provider_school_access;
DROP POLICY IF EXISTS "Parents can insert their own affiliations" ON public.parent_school_affiliations;

CREATE TABLE public.access_code_attempts (
 user_id uuid PRIMARY KEY, window_started_at timestamptz NOT NULL, attempts integer NOT NULL
);
ALTER TABLE public.access_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_code_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_school_by_code(p_code text, p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school public.schools; v_parent uuid; v_provider uuid; v_attempts integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.session_account_enabled() THEN
   RAISE EXCEPTION 'Authentification requise.' USING ERRCODE = '42501';
 END IF;
 -- Invalid attempts return a result instead of raising: the throttle must commit.
 INSERT INTO public.access_code_attempts VALUES (auth.uid(),clock_timestamp(),1)
 ON CONFLICT (user_id) DO UPDATE SET
   attempts = CASE WHEN access_code_attempts.window_started_at < clock_timestamp()-interval '15 minutes' THEN 1 ELSE access_code_attempts.attempts+1 END,
   window_started_at = CASE WHEN access_code_attempts.window_started_at < clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE access_code_attempts.window_started_at END
 RETURNING attempts INTO v_attempts;
 IF v_attempts > 10 THEN RETURN jsonb_build_object('error','Trop de tentatives. Réessayez dans 15 minutes.'); END IF;
 IF p_role NOT IN ('parent','provider') OR length(btrim(p_code)) NOT BETWEEN 6 AND 100 THEN
   RETURN jsonb_build_object('error','Code invalide ou accès indisponible.');
 END IF;
 SELECT s.* INTO v_school FROM public.schools s JOIN public.school_access_secrets codes ON codes.school_id=s.id WHERE codes.access_code=upper(btrim(p_code));
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Code invalide ou accès indisponible.'); END IF;
 IF p_role = 'provider' THEN
   v_provider := public.current_provider_id();
   IF v_provider IS NULL THEN RETURN jsonb_build_object('error','Compte prestataire actif requis.'); END IF;
   INSERT INTO public.provider_school_access(provider_id,school_id) VALUES(v_provider,v_school.id)
     ON CONFLICT (provider_id,school_id) DO NOTHING;
 ELSE
   v_parent := public.current_parent_id();
   IF v_parent IS NULL THEN RETURN jsonb_build_object('error','Compte parent requis.'); END IF;
   INSERT INTO public.parent_school_affiliations(parent_id,school_id,status) VALUES(v_parent,v_school.id,'active')
     ON CONFLICT (parent_id,school_id) DO UPDATE SET status='active';
 END IF;
 RETURN jsonb_build_object('school',to_jsonb(v_school)-'access_code'-'provider_registration_code');
END $$;
REVOKE ALL ON FUNCTION public.join_school_by_code(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_school_by_code(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_school_access()
RETURNS SETOF public.schools LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accès administrateur requis.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT (jsonb_populate_record(NULL::public.schools,
   to_jsonb(s)||jsonb_build_object('access_code',codes.access_code,'provider_registration_code',codes.provider_registration_code))).*
   FROM public.schools s LEFT JOIN public.school_access_secrets codes ON codes.school_id=s.id ORDER BY s.name;
END $$;
REVOKE ALL ON FUNCTION public.admin_school_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_school_access() TO authenticated;

-- Inserting a child directly must not bypass code validation.
CREATE OR REPLACE FUNCTION public.require_child_affiliation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF public.is_admin() OR auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF EXISTS (SELECT 1 FROM public.parents WHERE id=NEW.parent_id AND user_id=auth.uid())
    AND (TG_OP='INSERT' OR NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id)
    AND NOT EXISTS (SELECT 1 FROM public.parent_school_affiliations
      WHERE parent_id=NEW.parent_id AND school_id=NEW.school_id AND status='active') THEN
   RAISE EXCEPTION 'Ajoutez cette école avec son code d’accès avant de la sélectionner.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER require_child_affiliation BEFORE INSERT OR UPDATE ON public.children
 FOR EACH ROW EXECUTE FUNCTION public.require_child_affiliation();
REVOKE ALL ON FUNCTION public.store_private_school_codes() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.require_child_affiliation() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.generate_school_access_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE candidate text;
BEGIN
 LOOP
   candidate := 'SCH-' || upper(replace(gen_random_uuid()::text,'-',''));
   EXIT WHEN NOT EXISTS (SELECT 1 FROM public.school_access_secrets WHERE access_code=candidate);
 END LOOP;
 RETURN candidate;
END $$;
REVOKE ALL ON FUNCTION public.generate_school_access_code() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_school_access_code() TO authenticated,service_role;
COMMIT;
