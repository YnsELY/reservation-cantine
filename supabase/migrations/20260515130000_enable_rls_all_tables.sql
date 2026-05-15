/*
  Active Row Level Security (RLS) sur toutes les tables `public` qui étaient
  actuellement `unrestricted` ou ouvertes via une policy `USING (true)`,
  et installe des politiques cohérentes basées sur `auth.uid()`.

  Modèle d'auth en production :
    - Supabase Auth (auth.uid())
    - parents.user_id, providers.user_id, schools.user_id pointent vers auth.users.id
    - Admin = parents.is_admin = true (vu via auth.uid())
    - Les edge functions utilisent SERVICE_ROLE_KEY et bypassent RLS automatiquement

  Tables verrouillées par cette migration :
    schools, parents, children, menus, supplements, reservations,
    parent_credits, cart_items, user_push_tokens, notification_preferences,
    notification_logs

  Tables déjà sécurisées (intactes) :
    providers, school_providers, school_registration_codes,
    parent_school_affiliations, provider_school_access,
    provider_registration_codes, provider_supplements,
    provider_menu_library, provider_week_plans, provider_week_plan_days,
    pending_payments

  Effets :
    - Drop des anciennes policies basées sur `current_setting('app.current_access_code')`
      qui sont mortes (le client ne définit jamais ce setting) — sans le drop elles
      bloqueraient l'application dès qu'on réactive RLS.
    - Drop des policies `USING (true)` sur les tables de notifications et de panier.
    - Création de policies par rôle (parent / school / provider / admin) via des
      fonctions SECURITY DEFINER pour éviter les boucles RLS.
*/

-- =========================================================================
-- 1. Fonctions utilitaires (SECURITY DEFINER pour éviter les loops RLS)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parents
    WHERE user_id = auth.uid()
      AND is_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_parent_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM parents WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_provider_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM providers WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM schools WHERE user_id = auth.uid() LIMIT 1;
$$;

-- =========================================================================
-- 2. Purge des anciennes policies (current_setting morte + USING(true))
-- =========================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'schools', 'parents', 'children', 'menus', 'supplements',
        'reservations', 'parent_credits', 'cart_items',
        'user_push_tokens', 'notification_preferences', 'notification_logs'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policyname, r.tablename
    );
  END LOOP;
END $$;

-- =========================================================================
-- 3. Activation RLS
-- =========================================================================

ALTER TABLE public.schools                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_credits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_push_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs       ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 4. SCHOOLS
-- =========================================================================
-- L'école elle-même, les admins, les parents affiliés et les prestataires
-- ayant un accès peuvent lire. Seuls les admins peuvent créer/supprimer une école.
-- L'école peut éditer son propre profil. L'anonyme peut lire (lecture seule)
-- car la page d'inscription parent doit pouvoir vérifier le code d'accès.

CREATE POLICY "schools_select_anon"
  ON public.schools FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "schools_select_authenticated"
  ON public.schools FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "schools_insert_admin"
  ON public.schools FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "schools_update_self_or_admin"
  ON public.schools FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "schools_delete_admin"
  ON public.schools FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =========================================================================
-- 5. PARENTS
-- =========================================================================
-- Un parent voit/met à jour son propre profil. Les admins voient tout.
-- Les écoles voient les parents dont au moins un enfant est inscrit chez elles.
-- Insert : pas de policy (création via auth signup + service role).

CREATE POLICY "parents_select_self"
  ON public.parents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "parents_select_admin"
  ON public.parents FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "parents_select_school"
  ON public.parents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.parent_id = parents.id
        AND c.school_id = public.current_school_id()
    )
  );

CREATE POLICY "parents_update_self"
  ON public.parents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "parents_update_admin"
  ON public.parents FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "parents_insert_admin"
  ON public.parents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR user_id = auth.uid());

CREATE POLICY "parents_delete_admin"
  ON public.parents FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =========================================================================
-- 6. CHILDREN
-- =========================================================================
-- Le parent gère ses propres enfants. L'école voit les élèves de son école.
-- L'admin gère tout.

CREATE POLICY "children_select_own_parent"
  ON public.children FOR SELECT
  TO authenticated
  USING (parent_id = public.current_parent_id());

CREATE POLICY "children_select_school"
  ON public.children FOR SELECT
  TO authenticated
  USING (school_id = public.current_school_id());

CREATE POLICY "children_select_admin"
  ON public.children FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "children_insert_parent"
  ON public.children FOR INSERT
  TO authenticated
  WITH CHECK (parent_id = public.current_parent_id());

CREATE POLICY "children_insert_admin"
  ON public.children FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "children_update_parent"
  ON public.children FOR UPDATE
  TO authenticated
  USING (parent_id = public.current_parent_id())
  WITH CHECK (parent_id = public.current_parent_id());

CREATE POLICY "children_update_admin"
  ON public.children FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "children_delete_parent"
  ON public.children FOR DELETE
  TO authenticated
  USING (parent_id = public.current_parent_id());

CREATE POLICY "children_delete_admin"
  ON public.children FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =========================================================================
-- 7. MENUS
-- =========================================================================
-- Lecture ouverte aux utilisateurs authentifiés (parents, écoles, prestataires,
-- admins) car les menus sont la base du catalogue. L'anonyme n'a pas accès.
-- Écriture : prestataire propriétaire OU admin.

CREATE POLICY "menus_select_authenticated"
  ON public.menus FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "menus_insert_provider"
  ON public.menus FOR INSERT
  TO authenticated
  WITH CHECK (provider_id = public.current_provider_id());

CREATE POLICY "menus_insert_admin"
  ON public.menus FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "menus_update_provider"
  ON public.menus FOR UPDATE
  TO authenticated
  USING (provider_id = public.current_provider_id())
  WITH CHECK (provider_id = public.current_provider_id());

CREATE POLICY "menus_update_admin"
  ON public.menus FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "menus_delete_provider"
  ON public.menus FOR DELETE
  TO authenticated
  USING (provider_id = public.current_provider_id());

CREATE POLICY "menus_delete_admin"
  ON public.menus FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =========================================================================
-- 8. SUPPLEMENTS (ancienne table school-level, conservée pour compat)
-- =========================================================================

CREATE POLICY "supplements_select_authenticated"
  ON public.supplements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "supplements_write_admin"
  ON public.supplements FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "supplements_write_school"
  ON public.supplements FOR ALL
  TO authenticated
  USING (school_id = public.current_school_id())
  WITH CHECK (school_id = public.current_school_id());

-- =========================================================================
-- 9. RESERVATIONS
-- =========================================================================
-- Parent : voit/crée/met à jour ses propres résas.
-- École : voit/crée les résas pour les enfants de son école.
-- Prestataire : voit (read-only) les résas sur ses menus.
-- Admin : full.

CREATE POLICY "reservations_select_parent"
  ON public.reservations FOR SELECT
  TO authenticated
  USING (parent_id = public.current_parent_id());

CREATE POLICY "reservations_select_school"
  ON public.reservations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = reservations.child_id
        AND c.school_id = public.current_school_id()
    )
  );

CREATE POLICY "reservations_select_provider"
  ON public.reservations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.menus m
      WHERE m.id = reservations.menu_id
        AND m.provider_id = public.current_provider_id()
    )
  );

CREATE POLICY "reservations_select_admin"
  ON public.reservations FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "reservations_insert_parent"
  ON public.reservations FOR INSERT
  TO authenticated
  WITH CHECK (parent_id = public.current_parent_id());

CREATE POLICY "reservations_insert_school"
  ON public.reservations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = reservations.child_id
        AND c.school_id = public.current_school_id()
    )
  );

CREATE POLICY "reservations_insert_admin"
  ON public.reservations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "reservations_update_parent"
  ON public.reservations FOR UPDATE
  TO authenticated
  USING (parent_id = public.current_parent_id())
  WITH CHECK (parent_id = public.current_parent_id());

CREATE POLICY "reservations_update_school"
  ON public.reservations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = reservations.child_id
        AND c.school_id = public.current_school_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = reservations.child_id
        AND c.school_id = public.current_school_id()
    )
  );

CREATE POLICY "reservations_update_admin"
  ON public.reservations FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "reservations_delete_admin"
  ON public.reservations FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =========================================================================
-- 10. PARENT_CREDITS (cagnotte)
-- =========================================================================
-- Le parent voit/crée/met à jour ses propres crédits (annulation + consume
-- côté client sur paiement gratuit). Admin full. Le callback Payzone passe
-- via service_role et bypass RLS.

CREATE POLICY "parent_credits_select_self"
  ON public.parent_credits FOR SELECT
  TO authenticated
  USING (parent_id = public.current_parent_id());

CREATE POLICY "parent_credits_select_admin"
  ON public.parent_credits FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "parent_credits_insert_self"
  ON public.parent_credits FOR INSERT
  TO authenticated
  WITH CHECK (parent_id = public.current_parent_id());

CREATE POLICY "parent_credits_update_self"
  ON public.parent_credits FOR UPDATE
  TO authenticated
  USING (parent_id = public.current_parent_id())
  WITH CHECK (parent_id = public.current_parent_id());

CREATE POLICY "parent_credits_admin_all"
  ON public.parent_credits FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================================
-- 11. CART_ITEMS
-- =========================================================================
-- Strictement privé au parent.

CREATE POLICY "cart_items_owner_all"
  ON public.cart_items FOR ALL
  TO authenticated
  USING (parent_id = public.current_parent_id())
  WITH CHECK (parent_id = public.current_parent_id());

CREATE POLICY "cart_items_admin_select"
  ON public.cart_items FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- =========================================================================
-- 12. USER_PUSH_TOKENS
-- =========================================================================
-- Chaque utilisateur enregistre/met à jour son propre token. La colonne
-- user_id peut référer à parents.id, schools.id ou providers.id selon
-- user_type. On accepte l'enregistrement si l'auth.uid() est lié à l'une
-- de ces lignes.

CREATE POLICY "push_tokens_select_self"
  ON public.user_push_tokens FOR SELECT
  TO authenticated
  USING (
    user_id = public.current_parent_id()
    OR user_id = public.current_provider_id()
    OR user_id = public.current_school_id()
  );

CREATE POLICY "push_tokens_insert_self"
  ON public.user_push_tokens FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = public.current_parent_id()
    OR user_id = public.current_provider_id()
    OR user_id = public.current_school_id()
  );

CREATE POLICY "push_tokens_update_self"
  ON public.user_push_tokens FOR UPDATE
  TO authenticated
  USING (
    user_id = public.current_parent_id()
    OR user_id = public.current_provider_id()
    OR user_id = public.current_school_id()
  )
  WITH CHECK (
    user_id = public.current_parent_id()
    OR user_id = public.current_provider_id()
    OR user_id = public.current_school_id()
  );

CREATE POLICY "push_tokens_delete_self"
  ON public.user_push_tokens FOR DELETE
  TO authenticated
  USING (
    user_id = public.current_parent_id()
    OR user_id = public.current_provider_id()
    OR user_id = public.current_school_id()
  );

CREATE POLICY "push_tokens_admin_all"
  ON public.user_push_tokens FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================================
-- 13. NOTIFICATION_PREFERENCES
-- =========================================================================

CREATE POLICY "notification_prefs_owner_all"
  ON public.notification_preferences FOR ALL
  TO authenticated
  USING (
    user_id = public.current_parent_id()
    OR user_id = public.current_provider_id()
    OR user_id = public.current_school_id()
  )
  WITH CHECK (
    user_id = public.current_parent_id()
    OR user_id = public.current_provider_id()
    OR user_id = public.current_school_id()
  );

CREATE POLICY "notification_prefs_admin_all"
  ON public.notification_preferences FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================================
-- 14. NOTIFICATION_LOGS
-- =========================================================================
-- Les logs sont écrits exclusivement par les edge functions (service_role).
-- Le client n'a accès qu'en lecture sur ses propres logs.

CREATE POLICY "notification_logs_select_self"
  ON public.notification_logs FOR SELECT
  TO authenticated
  USING (
    user_id = public.current_parent_id()
    OR user_id = public.current_provider_id()
    OR user_id = public.current_school_id()
  );

CREATE POLICY "notification_logs_select_admin"
  ON public.notification_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- =========================================================================
-- 15. Grants pour les fonctions utilitaires
-- =========================================================================

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_parent_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_provider_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO anon, authenticated;
