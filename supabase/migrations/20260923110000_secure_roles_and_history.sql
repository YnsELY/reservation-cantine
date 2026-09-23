BEGIN;

-- Privilege changes are server/admin operations, never profile edits.
CREATE OR REPLACE FUNCTION public.guard_account_privileges()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'parents' THEN
    IF (TG_OP = 'INSERT' AND (NEW.is_admin IS TRUE OR NEW.user_id IS DISTINCT FROM auth.uid()))
       OR (TG_OP = 'UPDATE' AND (NEW.is_admin IS DISTINCT FROM OLD.is_admin
           OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id)) THEN
      RAISE EXCEPTION 'Les droits et le propriétaire du compte ne peuvent pas être modifiés.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.registration_code IS DISTINCT FROM OLD.registration_code
       OR NEW.must_change_credentials IS DISTINCT FROM OLD.must_change_credentials THEN
      RAISE EXCEPTION 'Modification des droits du prestataire réservée à l’administration.' USING ERRCODE = '42501';
    END IF;
    IF OLD.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Ce compte prestataire est désactivé.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_parent_privileges BEFORE INSERT OR UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_privileges();
CREATE TRIGGER guard_provider_privileges BEFORE INSERT OR UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_privileges();
DROP POLICY IF EXISTS "Authenticated users can insert provider with valid code" ON public.providers;
DROP POLICY IF EXISTS "School users can update their providers" ON public.providers;

CREATE OR REPLACE FUNCTION public.current_provider_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.providers WHERE user_id = auth.uid() AND is_active IS TRUE LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.session_account_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.providers WHERE user_id = auth.uid() AND is_active IS NOT TRUE);
$$;
REVOKE ALL ON FUNCTION public.session_account_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_account_enabled() TO authenticated, service_role;

-- A restrictive rule also covers old policies which look up providers directly.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity
    AND tablename <> 'providers' LOOP
    EXECUTE format('CREATE POLICY active_account_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.session_account_enabled()) WITH CHECK (public.session_account_enabled())', t.tablename);
  END LOOP;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY active_account_required ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (public.session_account_enabled()) WITH CHECK (public.session_account_enabled())';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.provider_can_read_child(p_child_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.reservations r JOIN public.menus m ON m.id = r.menu_id
   WHERE r.child_id = p_child_id AND m.provider_id = public.current_provider_id());
$$;
CREATE OR REPLACE FUNCTION public.provider_can_read_parent(p_parent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.reservations r JOIN public.menus m ON m.id = r.menu_id
   WHERE r.parent_id = p_parent_id AND m.provider_id = public.current_provider_id());
$$;

-- Deactivation and affiliation removal commit together.
CREATE OR REPLACE FUNCTION public.set_provider_active(p_provider_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accès administrateur requis.' USING ERRCODE = '42501'; END IF;
  UPDATE public.providers SET is_active = p_active WHERE id = p_provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte introuvable.'; END IF;
  IF NOT p_active THEN
    DELETE FROM public.provider_school_access WHERE provider_id = p_provider_id;
    UPDATE public.user_push_tokens SET is_active = false WHERE user_id = p_provider_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_provider_active(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_provider_active(uuid,boolean) TO authenticated;

-- Deleting a child must never cascade into paid/historical reservations.
ALTER TABLE public.reservations DROP CONSTRAINT reservations_child_id_fkey;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_child_id_fkey
 FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION public.protect_child_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Same child lock as prepare_meal_checkout; concurrent checkout cannot pass deletion.
  IF EXISTS (SELECT 1 FROM public.reservations WHERE child_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.meal_payment_holds WHERE child_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.pending_payments p, jsonb_array_elements(p.cart_items) i
      WHERE i->>'child_id' = OLD.id::text) THEN
    RAISE EXCEPTION 'Cet enfant est lié à des commandes ou à un paiement. Sa fiche doit être conservée pour préserver l’historique.';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER protect_child_history BEFORE DELETE ON public.children
 FOR EACH ROW EXECUTE FUNCTION public.protect_child_history();

-- Ledger entries and payment snapshots retain stable credit IDs forever.
CREATE OR REPLACE FUNCTION public.protect_credit_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Une cagnotte ne peut pas être supprimée. Désactivez-la pour conserver son historique.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
       OR NEW.source_reservation_id IS DISTINCT FROM OLD.source_reservation_id THEN
      RAISE EXCEPTION 'Le propriétaire et l’origine d’une cagnotte sont immuables.';
    END IF;
    IF OLD.reserved_amount > 0 AND (NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
      RAISE EXCEPTION 'Un paiement utilise cette cagnotte. Reprenez ou vérifiez ce paiement avant de modifier le crédit.';
    END IF;
  END IF;
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF (TG_OP = 'INSERT' AND (coalesce(NEW.used_amount,0) <> 0 OR coalesce(NEW.reserved_amount,0) <> 0))
       OR (TG_OP = 'UPDATE' AND (NEW.used_amount IS DISTINCT FROM OLD.used_amount
         OR NEW.reserved_amount IS DISTINCT FROM OLD.reserved_amount)) THEN
      RAISE EXCEPTION 'La consommation des crédits est gérée exclusivement par le paiement.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_credit_history BEFORE INSERT OR UPDATE OR DELETE ON public.parent_credits
 FOR EACH ROW EXECUTE FUNCTION public.protect_credit_history();

-- No recoverable account password may be stored in application tables.
DELETE FROM public.managed_account_passwords;
REVOKE ALL ON public.managed_account_passwords FROM anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.reject_password_storage()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Le stockage des mots de passe dans l’application est interdit.';
END $$;
CREATE TRIGGER reject_password_storage BEFORE INSERT OR UPDATE ON public.managed_account_passwords
 FOR EACH ROW EXECUTE FUNCTION public.reject_password_storage();
-- Only an actual Auth password change clears the first-login credential flag.
CREATE OR REPLACE FUNCTION public.mark_managed_password_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password AND coalesce(NEW.encrypted_password,'')<>'' THEN
   UPDATE public.providers SET must_change_credentials=false WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mark_managed_password_changed() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mark_managed_password_changed AFTER UPDATE OF encrypted_password ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.mark_managed_password_changed();
REVOKE ALL ON FUNCTION public.guard_account_privileges() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_child_history() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_credit_history() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reject_password_storage() FROM PUBLIC,anon,authenticated;
COMMIT;
