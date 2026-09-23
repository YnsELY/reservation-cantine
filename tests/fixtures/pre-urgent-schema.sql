-- Schema-only baseline for regression tests. No production records or credentials.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, encrypted_password text); CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id));
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('session_id',nullif(current_setting('test.session',true),'')) $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT SELECT ON auth.users,auth.sessions TO service_role;
CREATE TABLE public."managed_account_passwords" (user_id uuid NOT NULL, account_type text NOT NULL, email text, temp_password text NOT NULL, updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public."credit_movements" (id uuid NOT NULL DEFAULT gen_random_uuid(), credit_id uuid NOT NULL, parent_id uuid NOT NULL, operation text NOT NULL, reference text, actor_id uuid, old_amount numeric(10,2), new_amount numeric(10,2), old_used numeric(10,2), new_used numeric(10,2), old_reserved numeric(10,2), new_reserved numeric(10,2), reason text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."children" (id uuid NOT NULL DEFAULT gen_random_uuid(), parent_id uuid NOT NULL, school_id uuid NOT NULL, first_name text NOT NULL, last_name text NOT NULL, grade text, allergies text[] DEFAULT '{}'::text[], dietary_restrictions text[] DEFAULT '{}'::text[], created_at timestamp with time zone DEFAULT now(), date_of_birth date, genre text);
CREATE TABLE public."parents" (id uuid NOT NULL DEFAULT gen_random_uuid(), access_code text NOT NULL, email text, phone text, first_name text NOT NULL, last_name text NOT NULL, is_admin boolean DEFAULT false, school_id uuid, created_at timestamp with time zone DEFAULT now(), user_id uuid);
CREATE TABLE public."cart_items" (id uuid NOT NULL DEFAULT gen_random_uuid(), parent_id uuid NOT NULL, child_id uuid NOT NULL, menu_id uuid NOT NULL, date date NOT NULL, supplements jsonb DEFAULT '[]'::jsonb, annotations text, total_price numeric NOT NULL, created_at timestamp with time zone DEFAULT now(), confirmed_daily_quantity integer NOT NULL DEFAULT 1, repeat_order_confirmed_at timestamp with time zone);
CREATE TABLE public."supplements" (id uuid NOT NULL DEFAULT gen_random_uuid(), school_id uuid NOT NULL, name text NOT NULL, description text, price numeric(10,2) NOT NULL DEFAULT 0, available boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public."menus" (id uuid NOT NULL DEFAULT gen_random_uuid(), school_id uuid NOT NULL, date date NOT NULL, meal_name text NOT NULL, description text, price numeric(10,2) NOT NULL DEFAULT 0, allergens text[] DEFAULT '{}'::text[], image_url text, available boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), card_color text DEFAULT '#FF6B6B'::text, provider_id uuid, supplements uuid[] DEFAULT '{}'::uuid[], library_menu_id uuid, week_start_date date);
CREATE TABLE public."school_providers" (id uuid NOT NULL DEFAULT gen_random_uuid(), school_id uuid NOT NULL, provider_id uuid NOT NULL, active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public."provider_supplements" (id uuid NOT NULL DEFAULT gen_random_uuid(), provider_id uuid NOT NULL, school_id uuid NOT NULL, name text NOT NULL, description text, price numeric(10,2) NOT NULL DEFAULT 0, available boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), menu_id uuid, library_menu_id uuid, source_library_supplement_id uuid);
CREATE TABLE public."parent_registration_codes" (id uuid NOT NULL DEFAULT gen_random_uuid(), code text NOT NULL, description text, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public."pending_payments" (id uuid NOT NULL DEFAULT gen_random_uuid(), order_id text NOT NULL, charge_id text, parent_id uuid NOT NULL, cart_items jsonb NOT NULL, total_amount numeric(10,2) NOT NULL, status text DEFAULT 'pending'::text, payzone_transaction_id text, payzone_status text, failure_reason text, created_at timestamp with time zone DEFAULT now(), completed_at timestamp with time zone, failed_at timestamp with time zone, refunded_at timestamp with time zone, expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval), applied_credits jsonb DEFAULT '[]'::jsonb, checkout_key text);
CREATE TABLE public."provider_registration_codes" (id uuid NOT NULL DEFAULT gen_random_uuid(), code text NOT NULL, is_active boolean DEFAULT true, description text, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public."provider_school_access" (id uuid NOT NULL DEFAULT gen_random_uuid(), provider_id uuid NOT NULL, school_id uuid NOT NULL, granted_at timestamp with time zone DEFAULT now(), granted_by uuid);
CREATE TABLE public."parent_school_affiliations" (id uuid NOT NULL DEFAULT gen_random_uuid(), parent_id uuid NOT NULL, school_id uuid NOT NULL, status text NOT NULL DEFAULT 'active'::text, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public."provider_week_plan_days" (id uuid NOT NULL DEFAULT gen_random_uuid(), week_plan_id uuid NOT NULL, provider_id uuid NOT NULL, school_id uuid NOT NULL, date date NOT NULL, library_menu_ids uuid[] DEFAULT '{}'::uuid[], enabled_supplement_ids uuid[] DEFAULT '{}'::uuid[], created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public."parent_credits" (id uuid NOT NULL DEFAULT gen_random_uuid(), parent_id uuid NOT NULL, amount numeric(10,2) NOT NULL, used_amount numeric(10,2) NOT NULL DEFAULT 0, source_reservation_id uuid, week_start_date date, expires_at timestamp with time zone, created_at timestamp with time zone DEFAULT now(), meal_week_start_date date, is_active boolean NOT NULL DEFAULT true, reserved_amount numeric(10,2) NOT NULL DEFAULT 0, reason text, source_reference text);
CREATE TABLE public."provider_week_plans" (id uuid NOT NULL DEFAULT gen_random_uuid(), provider_id uuid NOT NULL, week_start_date date NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public."provider_menu_library" (id uuid NOT NULL DEFAULT gen_random_uuid(), provider_id uuid NOT NULL, meal_name text NOT NULL, description text, price numeric(10,2) NOT NULL DEFAULT 0, image_url text, card_color text DEFAULT '#FFE4E1'::text, available boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public."school_registration_codes" (id uuid NOT NULL DEFAULT gen_random_uuid(), code text NOT NULL, is_active boolean DEFAULT true, description text, created_at timestamp with time zone DEFAULT now(), provider_user_id uuid, school_id uuid);
CREATE TABLE public."notification_logs" (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, user_type character varying(20) NOT NULL, notification_type character varying(100) NOT NULL, title text NOT NULL, body text NOT NULL, data jsonb DEFAULT '{}'::jsonb, status character varying(20) DEFAULT 'pending'::character varying, error_message text, created_at timestamp with time zone DEFAULT now(), sent_at timestamp with time zone);
CREATE TABLE public."notification_preferences" (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, user_type character varying(20) NOT NULL, notification_type character varying(100) NOT NULL, enabled boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public."user_push_tokens" (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, user_type character varying(20) NOT NULL, push_token text NOT NULL, provider character varying(20) NOT NULL DEFAULT 'expo'::character varying, device_type character varying(20), is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), last_used_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public."providers" (id uuid NOT NULL DEFAULT gen_random_uuid(), name text, description text, contact_email text, contact_phone text, address text, created_at timestamp with time zone DEFAULT now(), user_id uuid, registration_code text, email text, company_name text, phone text, is_active boolean NOT NULL DEFAULT true, pin text, must_change_credentials boolean NOT NULL DEFAULT true);
CREATE TABLE public."provider_menu_templates" (id uuid NOT NULL DEFAULT gen_random_uuid(), provider_id uuid NOT NULL, meal_name text NOT NULL, description text, price numeric(10,2) NOT NULL DEFAULT 0, image_url text, card_color text NOT NULL DEFAULT '#FFE4E1'::text, specific_supplements jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public."schools" (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, address text, contact_email text, contact_phone text, created_at timestamp with time zone DEFAULT now(), access_code text, is_school_user boolean DEFAULT false, user_id uuid, provider_registration_code text, closed_weekdays smallint[] NOT NULL DEFAULT '{}'::smallint[]);
CREATE TABLE public."reservations" (id uuid NOT NULL DEFAULT gen_random_uuid(), child_id uuid NOT NULL, menu_id uuid NOT NULL, parent_id uuid NOT NULL, date date NOT NULL, supplements jsonb DEFAULT '[]'::jsonb, annotations text, total_price numeric(10,2) NOT NULL, payment_status text DEFAULT 'pending'::text, payment_intent_id text, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), created_by_school boolean DEFAULT false, school_payment_pending boolean DEFAULT false, cancelled_at timestamp with time zone, refund_status text DEFAULT 'none'::text, refunded_at timestamp with time zone, refunded_by uuid, confirmed_daily_quantity integer NOT NULL DEFAULT 1, repeat_order_confirmed_at timestamp with time zone, source_cart_item_id uuid);
CREATE TABLE public."meal_payment_holds" (child_id uuid NOT NULL, date date NOT NULL, order_id text NOT NULL);
ALTER TABLE public."schools" ADD CONSTRAINT "schools_pkey" PRIMARY KEY (id);
ALTER TABLE public."parents" ADD CONSTRAINT "parents_pkey" PRIMARY KEY (id);
ALTER TABLE public."parents" ADD CONSTRAINT "parents_access_code_key" UNIQUE (access_code);
ALTER TABLE public."children" ADD CONSTRAINT "children_pkey" PRIMARY KEY (id);
ALTER TABLE public."menus" ADD CONSTRAINT "menus_pkey" PRIMARY KEY (id);
ALTER TABLE public."supplements" ADD CONSTRAINT "supplements_pkey" PRIMARY KEY (id);
ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])));
ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_pkey" PRIMARY KEY (id);
ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."providers" ADD CONSTRAINT "providers_pkey" PRIMARY KEY (id);
ALTER TABLE public."school_providers" ADD CONSTRAINT "school_providers_pkey" PRIMARY KEY (id);
ALTER TABLE public."school_providers" ADD CONSTRAINT "school_providers_school_id_provider_id_key" UNIQUE (school_id, provider_id);
ALTER TABLE public."schools" ADD CONSTRAINT "schools_access_code_key" UNIQUE (access_code);
ALTER TABLE public."parents" ADD CONSTRAINT "parents_user_id_key" UNIQUE (user_id);
ALTER TABLE public."schools" ADD CONSTRAINT "schools_user_id_key" UNIQUE (user_id);
ALTER TABLE public."school_registration_codes" ADD CONSTRAINT "school_registration_codes_pkey" PRIMARY KEY (id);
ALTER TABLE public."school_registration_codes" ADD CONSTRAINT "school_registration_codes_code_key" UNIQUE (code);
ALTER TABLE public."parent_school_affiliations" ADD CONSTRAINT "parent_school_affiliations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'rejected'::text])));
ALTER TABLE public."parent_school_affiliations" ADD CONSTRAINT "parent_school_affiliations_pkey" PRIMARY KEY (id);
ALTER TABLE public."parent_school_affiliations" ADD CONSTRAINT "parent_school_affiliations_parent_id_school_id_key" UNIQUE (parent_id, school_id);
ALTER TABLE public."providers" ADD CONSTRAINT "providers_user_id_key" UNIQUE (user_id);
ALTER TABLE public."providers" ADD CONSTRAINT "providers_registration_code_key" UNIQUE (registration_code);
ALTER TABLE public."provider_school_access" ADD CONSTRAINT "provider_school_access_pkey" PRIMARY KEY (id);
ALTER TABLE public."provider_school_access" ADD CONSTRAINT "provider_school_access_provider_id_school_id_key" UNIQUE (provider_id, school_id);
ALTER TABLE public."provider_registration_codes" ADD CONSTRAINT "provider_registration_codes_pkey" PRIMARY KEY (id);
ALTER TABLE public."provider_registration_codes" ADD CONSTRAINT "provider_registration_codes_code_key" UNIQUE (code);
ALTER TABLE public."provider_supplements" ADD CONSTRAINT "provider_supplements_pkey" PRIMARY KEY (id);
ALTER TABLE public."parent_registration_codes" ADD CONSTRAINT "parent_registration_codes_pkey" PRIMARY KEY (id);
ALTER TABLE public."parent_registration_codes" ADD CONSTRAINT "parent_registration_codes_code_key" UNIQUE (code);
ALTER TABLE public."pending_payments" ADD CONSTRAINT "pending_payments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text, 'expired'::text])));
ALTER TABLE public."pending_payments" ADD CONSTRAINT "pending_payments_pkey" PRIMARY KEY (id);
ALTER TABLE public."pending_payments" ADD CONSTRAINT "pending_payments_order_id_key" UNIQUE (order_id);
ALTER TABLE public."provider_week_plans" ADD CONSTRAINT "provider_week_plans_pkey" PRIMARY KEY (id);
ALTER TABLE public."provider_week_plans" ADD CONSTRAINT "provider_week_plans_provider_id_week_start_date_key" UNIQUE (provider_id, week_start_date);
ALTER TABLE public."provider_menu_templates" ADD CONSTRAINT "provider_menu_templates_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_push_tokens" ADD CONSTRAINT "user_push_tokens_user_type_check" CHECK (((user_type)::text = ANY ((ARRAY['parent'::character varying, 'school'::character varying, 'provider'::character varying, 'admin'::character varying])::text[])));
ALTER TABLE public."provider_week_plan_days" ADD CONSTRAINT "provider_week_plan_days_pkey" PRIMARY KEY (id);
ALTER TABLE public."provider_week_plan_days" ADD CONSTRAINT "provider_week_plan_days_week_plan_id_school_id_date_key" UNIQUE (week_plan_id, school_id, date);
ALTER TABLE public."user_push_tokens" ADD CONSTRAINT "user_push_tokens_provider_check" CHECK (((provider)::text = ANY ((ARRAY['expo'::character varying, 'fcm'::character varying, 'apns'::character varying])::text[])));
ALTER TABLE public."user_push_tokens" ADD CONSTRAINT "user_push_tokens_device_type_check" CHECK (((device_type)::text = ANY ((ARRAY['ios'::character varying, 'android'::character varying, 'web'::character varying])::text[])));
ALTER TABLE public."user_push_tokens" ADD CONSTRAINT "user_push_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE public."notification_preferences" ADD CONSTRAINT "notification_preferences_user_type_check" CHECK (((user_type)::text = ANY ((ARRAY['parent'::character varying, 'school'::character varying, 'provider'::character varying, 'admin'::character varying])::text[])));
ALTER TABLE public."notification_preferences" ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY (id);
ALTER TABLE public."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_type_notification_typ_key" UNIQUE (user_id, user_type, notification_type);
ALTER TABLE public."notification_logs" ADD CONSTRAINT "notification_logs_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'delivered'::character varying, 'failed'::character varying])::text[])));
ALTER TABLE public."notification_logs" ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_refund_status_check" CHECK ((refund_status = ANY (ARRAY['none'::text, 'pending'::text, 'refunded'::text])));
ALTER TABLE public."provider_menu_library" ADD CONSTRAINT "provider_menu_library_pkey" PRIMARY KEY (id);
ALTER TABLE public."parent_credits" ADD CONSTRAINT "parent_credits_amount_check" CHECK ((amount >= (0)::numeric));
ALTER TABLE public."parent_credits" ADD CONSTRAINT "parent_credits_used_amount_check" CHECK ((used_amount >= (0)::numeric));
ALTER TABLE public."parent_credits" ADD CONSTRAINT "parent_credits_used_le_amount" CHECK ((used_amount <= amount));
ALTER TABLE public."parent_credits" ADD CONSTRAINT "parent_credits_pkey" PRIMARY KEY (id);
ALTER TABLE public."parent_credits" ADD CONSTRAINT "parent_credits_unique_source" UNIQUE (source_reservation_id);
ALTER TABLE public."children" ADD CONSTRAINT "children_genre_check" CHECK (((genre IS NULL) OR (genre = ANY (ARRAY['fille'::text, 'garcon'::text]))));
ALTER TABLE public."providers" ADD CONSTRAINT "providers_pin_check" CHECK (((pin IS NULL) OR (pin ~ '^[0-9]{4}$'::text)));
ALTER TABLE public."managed_account_passwords" ADD CONSTRAINT "managed_account_passwords_account_type_check" CHECK ((account_type = ANY (ARRAY['provider'::text, 'school'::text])));
ALTER TABLE public."managed_account_passwords" ADD CONSTRAINT "managed_account_passwords_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_confirmed_daily_quantity_check" CHECK ((confirmed_daily_quantity >= 1));
ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_confirmed_daily_quantity_check" CHECK ((confirmed_daily_quantity >= 1));
ALTER TABLE public."parent_credits" ADD CONSTRAINT "parent_credits_available_check" CHECK (((reserved_amount >= (0)::numeric) AND ((used_amount + reserved_amount) <= amount)));
ALTER TABLE public."meal_payment_holds" ADD CONSTRAINT "meal_payment_holds_pkey" PRIMARY KEY (child_id, date);
ALTER TABLE public."credit_movements" ADD CONSTRAINT "credit_movements_pkey" PRIMARY KEY (id);
ALTER TABLE public."parents" ADD CONSTRAINT "parents_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id);
ALTER TABLE public."children" ADD CONSTRAINT "children_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE;
ALTER TABLE public."children" ADD CONSTRAINT "children_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id);
ALTER TABLE public."menus" ADD CONSTRAINT "menus_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id);
ALTER TABLE public."supplements" ADD CONSTRAINT "supplements_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id);
ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_child_id_fkey" FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;
ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_menu_id_fkey" FOREIGN KEY (menu_id) REFERENCES menus(id);
ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES parents(id);
ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE;
ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_child_id_fkey" FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;
ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_menu_id_fkey" FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE;
ALTER TABLE public."school_providers" ADD CONSTRAINT "school_providers_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public."school_providers" ADD CONSTRAINT "school_providers_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
ALTER TABLE public."parents" ADD CONSTRAINT "parents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."schools" ADD CONSTRAINT "schools_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."provider_menu_library" ADD CONSTRAINT "provider_menu_library_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
ALTER TABLE public."parent_school_affiliations" ADD CONSTRAINT "parent_school_affiliations_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE;
ALTER TABLE public."parent_school_affiliations" ADD CONSTRAINT "parent_school_affiliations_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public."providers" ADD CONSTRAINT "providers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."menus" ADD CONSTRAINT "menus_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES providers(id);
ALTER TABLE public."provider_school_access" ADD CONSTRAINT "provider_school_access_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
ALTER TABLE public."provider_school_access" ADD CONSTRAINT "provider_school_access_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public."provider_school_access" ADD CONSTRAINT "provider_school_access_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id);
ALTER TABLE public."school_registration_codes" ADD CONSTRAINT "school_registration_codes_provider_user_id_fkey" FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."provider_supplements" ADD CONSTRAINT "provider_supplements_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
ALTER TABLE public."provider_supplements" ADD CONSTRAINT "provider_supplements_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public."provider_supplements" ADD CONSTRAINT "provider_supplements_menu_id_fkey" FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE;
ALTER TABLE public."school_registration_codes" ADD CONSTRAINT "school_registration_codes_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public."pending_payments" ADD CONSTRAINT "pending_payments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE;
ALTER TABLE public."provider_supplements" ADD CONSTRAINT "provider_supplements_library_menu_id_fkey" FOREIGN KEY (library_menu_id) REFERENCES provider_menu_library(id) ON DELETE CASCADE;
ALTER TABLE public."provider_supplements" ADD CONSTRAINT "provider_supplements_source_library_supplement_id_fkey" FOREIGN KEY (source_library_supplement_id) REFERENCES provider_supplements(id) ON DELETE SET NULL;
ALTER TABLE public."menus" ADD CONSTRAINT "menus_library_menu_id_fkey" FOREIGN KEY (library_menu_id) REFERENCES provider_menu_library(id) ON DELETE SET NULL;
ALTER TABLE public."provider_menu_templates" ADD CONSTRAINT "provider_menu_templates_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
ALTER TABLE public."provider_week_plans" ADD CONSTRAINT "provider_week_plans_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_refunded_by_fkey" FOREIGN KEY (refunded_by) REFERENCES parents(id);
ALTER TABLE public."provider_week_plan_days" ADD CONSTRAINT "provider_week_plan_days_week_plan_id_fkey" FOREIGN KEY (week_plan_id) REFERENCES provider_week_plans(id) ON DELETE CASCADE;
ALTER TABLE public."provider_week_plan_days" ADD CONSTRAINT "provider_week_plan_days_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
ALTER TABLE public."provider_week_plan_days" ADD CONSTRAINT "provider_week_plan_days_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public."parent_credits" ADD CONSTRAINT "parent_credits_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE;
ALTER TABLE public."parent_credits" ADD CONSTRAINT "parent_credits_source_reservation_id_fkey" FOREIGN KEY (source_reservation_id) REFERENCES reservations(id);
ALTER TABLE public."meal_payment_holds" ADD CONSTRAINT "meal_payment_holds_child_id_fkey" FOREIGN KEY (child_id) REFERENCES children(id);
ALTER TABLE public."meal_payment_holds" ADD CONSTRAINT "meal_payment_holds_order_id_fkey" FOREIGN KEY (order_id) REFERENCES pending_payments(order_id);
ALTER TABLE public."credit_movements" ADD CONSTRAINT "credit_movements_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES parents(id);
CREATE INDEX idx_children_parent_id ON public.children USING btree (parent_id);
CREATE INDEX idx_children_school_id ON public.children USING btree (school_id);
CREATE INDEX idx_parents_access_code ON public.parents USING btree (access_code);
CREATE INDEX idx_parents_school_id ON public.parents USING btree (school_id);
CREATE INDEX idx_cart_items_parent_id ON public.cart_items USING btree (parent_id);
CREATE INDEX idx_cart_items_created_at ON public.cart_items USING btree (created_at);
CREATE INDEX idx_cart_items_meal ON public.cart_items USING btree (child_id, menu_id, date);
CREATE INDEX idx_cart_items_child_day ON public.cart_items USING btree (child_id, date);
CREATE INDEX idx_supplements_school_id ON public.supplements USING btree (school_id);
CREATE INDEX idx_menus_school_date ON public.menus USING btree (school_id, date);
CREATE INDEX idx_menus_library_menu_id ON public.menus USING btree (library_menu_id);
CREATE INDEX idx_menus_provider_week ON public.menus USING btree (provider_id, week_start_date);
CREATE INDEX idx_school_providers_school_id ON public.school_providers USING btree (school_id);
CREATE INDEX idx_school_providers_provider_id ON public.school_providers USING btree (provider_id);
CREATE INDEX idx_provider_supplements_provider_id ON public.provider_supplements USING btree (provider_id);
CREATE INDEX idx_provider_supplements_school_id ON public.provider_supplements USING btree (school_id);
CREATE INDEX idx_provider_supplements_available ON public.provider_supplements USING btree (available);
CREATE INDEX idx_provider_supplements_menu_id ON public.provider_supplements USING btree (menu_id);
CREATE INDEX idx_provider_supplements_library_menu_id ON public.provider_supplements USING btree (library_menu_id);
CREATE INDEX idx_provider_supplements_source_library_supplement_id ON public.provider_supplements USING btree (source_library_supplement_id);
CREATE INDEX idx_pending_payments_order_id ON public.pending_payments USING btree (order_id);
CREATE INDEX idx_pending_payments_parent_id ON public.pending_payments USING btree (parent_id);
CREATE INDEX idx_pending_payments_status ON public.pending_payments USING btree (status);
CREATE INDEX idx_pending_payments_created_at ON public.pending_payments USING btree (created_at);
CREATE UNIQUE INDEX pending_payments_checkout_key_unique ON public.pending_payments USING btree (checkout_key) WHERE (checkout_key IS NOT NULL);
CREATE INDEX idx_parent_school_affiliations_parent_id ON public.parent_school_affiliations USING btree (parent_id);
CREATE INDEX idx_parent_school_affiliations_school_id ON public.parent_school_affiliations USING btree (school_id);
CREATE INDEX idx_provider_week_plan_days_provider_date ON public.provider_week_plan_days USING btree (provider_id, date);
CREATE INDEX idx_provider_week_plan_days_school_date ON public.provider_week_plan_days USING btree (school_id, date);
CREATE INDEX idx_parent_credits_parent ON public.parent_credits USING btree (parent_id);
CREATE INDEX idx_parent_credits_week ON public.parent_credits USING btree (parent_id, week_start_date);
CREATE INDEX idx_parent_credits_active ON public.parent_credits USING btree (parent_id, expires_at) WHERE (used_amount < amount);
CREATE INDEX idx_provider_week_plans_provider_week ON public.provider_week_plans USING btree (provider_id, week_start_date);
CREATE INDEX idx_provider_menu_library_provider_id ON public.provider_menu_library USING btree (provider_id);
CREATE INDEX idx_provider_menu_library_available ON public.provider_menu_library USING btree (available);
CREATE INDEX idx_school_registration_codes_code ON public.school_registration_codes USING btree (code);
CREATE INDEX idx_school_registration_codes_provider_user_id ON public.school_registration_codes USING btree (provider_user_id);
CREATE INDEX idx_school_registration_codes_is_active ON public.school_registration_codes USING btree (is_active);
CREATE INDEX idx_school_registration_codes_school_id ON public.school_registration_codes USING btree (school_id);
CREATE INDEX idx_notification_logs_user ON public.notification_logs USING btree (user_id, user_type);
CREATE INDEX idx_notification_logs_type ON public.notification_logs USING btree (notification_type);
CREATE INDEX idx_notification_logs_created ON public.notification_logs USING btree (created_at DESC);
CREATE UNIQUE INDEX idx_push_tokens_token ON public.user_push_tokens USING btree (push_token);
CREATE INDEX idx_push_tokens_user ON public.user_push_tokens USING btree (user_id, user_type, is_active);
CREATE UNIQUE INDEX idx_schools_access_code ON public.schools USING btree (access_code);
CREATE INDEX idx_reservations_created_by_school ON public.reservations USING btree (created_by_school);
CREATE INDEX idx_reservations_school_payment_pending ON public.reservations USING btree (school_payment_pending);
CREATE INDEX idx_reservations_child_id ON public.reservations USING btree (child_id);
CREATE INDEX idx_reservations_date ON public.reservations USING btree (date);
CREATE INDEX idx_reservations_menu_id ON public.reservations USING btree (menu_id);
CREATE INDEX idx_reservations_parent_id ON public.reservations USING btree (parent_id);
CREATE INDEX idx_reservations_refund_status ON public.reservations USING btree (refund_status) WHERE (refund_status = 'pending'::text);
CREATE INDEX idx_reservations_active_meal ON public.reservations USING btree (child_id, menu_id, date) WHERE (payment_status IS DISTINCT FROM 'cancelled'::text);
CREATE INDEX idx_reservations_active_child_day ON public.reservations USING btree (child_id, date) WHERE (payment_status IS DISTINCT FROM 'cancelled'::text);
CREATE UNIQUE INDEX reservations_source_cart_item_unique ON public.reservations USING btree (source_cart_item_id) WHERE (source_cart_item_id IS NOT NULL);
CREATE OR REPLACE FUNCTION public.generate_school_access_code()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
code text;
exists boolean;
BEGIN
LOOP
code := 'SCH-' || upper(substring(md5(random()::text) from 1 for 6));
SELECT EXISTS(SELECT 1 FROM schools WHERE access_code = code) INTO exists;
EXIT WHEN NOT exists;
END LOOP;
RETURN code;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_expired_pending_payments()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE pending_payments
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < NOW();
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_push_token_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM parents
    WHERE user_id = auth.uid()
      AND is_admin = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.current_parent_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM parents WHERE user_id = auth.uid() LIMIT 1;
$function$
;
CREATE OR REPLACE FUNCTION public.current_provider_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM providers WHERE user_id = auth.uid() LIMIT 1;
$function$
;
CREATE OR REPLACE FUNCTION public.current_school_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM schools WHERE user_id = auth.uid() LIMIT 1;
$function$
;
CREATE OR REPLACE FUNCTION public.generate_access_code()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.provider_can_read_child(p_child_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (SELECT 1 FROM reservations r JOIN menus m ON m.id = r.menu_id
    JOIN providers p ON p.id = m.provider_id
    WHERE r.child_id = p_child_id AND p.user_id = auth.uid());
END; $function$
;
CREATE OR REPLACE FUNCTION public.provider_can_read_parent(p_parent_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (SELECT 1 FROM reservations r JOIN menus m ON m.id = r.menu_id
    JOIN providers p ON p.id = m.provider_id
    WHERE r.parent_id = p_parent_id AND p.user_id = auth.uid());
END; $function$
;
CREATE OR REPLACE FUNCTION public.provider_can_manage_parent(p_parent_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.providers pr
    JOIN public.provider_school_access psa
      ON psa.provider_id = pr.id
    JOIN public.children c
      ON c.school_id = psa.school_id
    WHERE pr.user_id = auth.uid()
      AND pr.is_active = true
      AND c.parent_id = p_parent_id
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.school_can_read_child_orders(p_child_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN EXISTS (SELECT 1 FROM public.reservations r JOIN public.menus m ON m.id = r.menu_id WHERE r.child_id = p_child_id AND m.school_id = public.current_school_id());
END;
$function$
;
CREATE OR REPLACE FUNCTION public.school_can_read_parent_orders(p_parent_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN EXISTS (SELECT 1 FROM public.reservations r JOIN public.menus m ON m.id = r.menu_id WHERE r.parent_id = p_parent_id AND m.school_id = public.current_school_id());
END;
$function$
;
CREATE OR REPLACE FUNCTION public.provider_managed_parents()
 RETURNS TABLE(id uuid, first_name text, last_name text, email text, children_names text[], school_names text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    pa.id,
    pa.first_name,
    pa.last_name,
    pa.email,
    ARRAY_AGG(
      DISTINCT NULLIF(
        CONCAT_WS(' ', c.first_name, c.last_name),
        ''
      )
    ) FILTER (
      WHERE NULLIF(
        CONCAT_WS(' ', c.first_name, c.last_name),
        ''
      ) IS NOT NULL
    ) AS children_names,
    ARRAY_AGG(
      DISTINCT s.name
      ORDER BY s.name
    ) AS school_names
  FROM public.providers pr
  JOIN public.provider_school_access psa
    ON psa.provider_id = pr.id
  JOIN public.schools s
    ON s.id = psa.school_id
  JOIN public.children c
    ON c.school_id = s.id
  JOIN public.parents pa
    ON pa.id = c.parent_id
  WHERE pr.user_id = auth.uid()
    AND pr.is_active = true
  GROUP BY
    pa.id,
    pa.first_name,
    pa.last_name,
    pa.email
  ORDER BY
    pa.last_name,
    pa.first_name;
$function$
;
CREATE OR REPLACE FUNCTION public.get_provider_school_students()
 RETURNS TABLE(id uuid, school_id uuid, first_name text, last_name text, grade text, parent_first_name text, parent_last_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT
    c.id,
    c.school_id,
    c.first_name,
    c.last_name,
    c.grade,
    pa.first_name AS parent_first_name,
    pa.last_name AS parent_last_name
  FROM public.providers pr
  JOIN public.provider_school_access psa
    ON psa.provider_id = pr.id
  JOIN public.children c
    ON c.school_id = psa.school_id
  JOIN public.parents pa
    ON pa.id = c.parent_id
  WHERE pr.user_id = auth.uid()
    AND pr.is_active = true
  ORDER BY
    c.last_name,
    c.first_name;
$function$
;
CREATE OR REPLACE FUNCTION public.get_provider_school_student_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT c.id)
  FROM public.providers pr
  JOIN public.provider_school_access psa
    ON psa.provider_id = pr.id
  JOIN public.children c
    ON c.school_id = psa.school_id
  WHERE pr.user_id = auth.uid()
    AND pr.is_active = true;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_child_school_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  school_name text;
BEGIN
  SELECT name INTO school_name FROM public.schools WHERE id = NEW.school_id;
  IF school_name ~* '\mla[[:space:]-]+vertu\M'
     AND NULLIF(btrim(NEW.grade), '') IS NOT NULL
     AND btrim(NEW.grade) NOT IN (
       'Petite Section', 'Moyenne Section', 'Grande Section',
       'CP', 'CE1', 'CE2', 'CM1', 'CM2'
     ) THEN
    RAISE EXCEPTION 'La Vertu accueille uniquement les classes de maternelle et élémentaire, jusqu’au CM2.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    -- Parents may transfer only to a school with an active affiliation.
    -- Other authorized roles retain their existing permissions.
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
$function$
;
CREATE OR REPLACE FUNCTION public.guard_duplicate_meal_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  reserved_count integer;
  cart_count integer := 0;
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    IF NEW.payment_status = 'cancelled' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
      -- Preserve the ability to annotate/pay/cancel historical duplicates.
      IF OLD.payment_status IS DISTINCT FROM 'cancelled'
        AND (OLD.child_id, OLD.menu_id, OLD.date) = (NEW.child_id, NEW.menu_id, NEW.date) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.child_id, OLD.date) IS DISTINCT FROM (NEW.child_id, NEW.date) THEN
      NEW.confirmed_daily_quantity := 1;
      NEW.repeat_order_confirmed_at := NULL;
    END IF;
  END IF;

  PERFORM c.id FROM public.children c WHERE c.id = NEW.child_id FOR UPDATE;
  SELECT count(*) INTO reserved_count FROM public.reservations r
    WHERE r.child_id = NEW.child_id AND r.date = NEW.date
      AND r.payment_status IS DISTINCT FROM 'cancelled'
      AND (TG_TABLE_NAME <> 'reservations' OR r.id <> NEW.id);
  IF TG_TABLE_NAME = 'cart_items' THEN
    SELECT count(*) INTO cart_count FROM public.cart_items ci
      WHERE ci.child_id = NEW.child_id AND ci.date = NEW.date AND ci.id <> NEW.id;
  END IF;

  IF reserved_count + cart_count + 1 > NEW.confirmed_daily_quantity THEN
    RAISE EXCEPTION USING ERRCODE = '23505', CONSTRAINT = 'meal_order_requires_confirmation',
      MESSAGE = 'Un repas est déjà commandé ou dans le panier pour cet enfant à cette date. Revenez au panier pour vérifier et confirmer le repas supplémentaire.';
  END IF;

  IF NEW.confirmed_daily_quantity > 1 THEN
    IF TG_TABLE_NAME = 'cart_items' THEN
      IF TG_OP = 'INSERT' THEN
        NEW.repeat_order_confirmed_at := now();
      ELSIF NEW.confirmed_daily_quantity IS DISTINCT FROM OLD.confirmed_daily_quantity
        OR OLD.repeat_order_confirmed_at IS NULL THEN
        NEW.repeat_order_confirmed_at := now();
      ELSE
        NEW.repeat_order_confirmed_at := OLD.repeat_order_confirmed_at;
      END IF;
    ELSE
      NEW.repeat_order_confirmed_at := coalesce(NEW.repeat_order_confirmed_at, now());
    END IF;
  ELSE
    NEW.repeat_order_confirmed_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.record_credit_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NEW; END IF;
  INSERT INTO public.credit_movements(credit_id,parent_id,operation,reference,actor_id,
    old_amount,new_amount,old_used,new_used,old_reserved,new_reserved,reason)
  VALUES(coalesce(NEW.id,OLD.id),coalesce(NEW.parent_id,OLD.parent_id),TG_OP,
    coalesce(nullif(current_setting('app.checkout_order',true),''),NEW.source_reference,OLD.source_reference),
    auth.uid(),OLD.amount,NEW.amount,OLD.used_amount,NEW.used_amount,
    OLD.reserved_amount,NEW.reserved_amount,coalesce(NEW.reason,OLD.reason));
  RETURN coalesce(NEW,OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_locked_cart_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM public.meal_payment_holds h
    JOIN public.pending_payments p ON p.order_id=h.order_id
    WHERE h.child_id=OLD.child_id AND h.date=OLD.date
      AND h.order_id IS DISTINCT FROM nullif(current_setting('app.checkout_order',true),'')
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.cart_items) i WHERE i->>'id'=OLD.id::text)) THEN
    RAISE EXCEPTION 'Un paiement est déjà en cours pour ce panier. Reprenez ce paiement ou contactez le support avant de modifier la commande.';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_payment_reservation_hold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.payment_status='cancelled' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (OLD.child_id,OLD.date)=(NEW.child_id,NEW.date)
    AND OLD.payment_status IS DISTINCT FROM 'cancelled' THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.meal_payment_holds h WHERE h.child_id=NEW.child_id AND h.date=NEW.date
    AND h.order_id IS DISTINCT FROM nullif(current_setting('app.checkout_order',true),'')) THEN
    RAISE EXCEPTION 'Un paiement est déjà en cours pour cet enfant à cette date';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.complete_payzone_payment(p_order_id text, p_transaction_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE payment public.pending_payments%ROWTYPE; applied record; owner_id uuid; held numeric;
BEGIN
  SELECT parent_id INTO owner_id FROM public.pending_payments WHERE order_id=p_order_id;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Commande de paiement introuvable'; END IF;
  PERFORM id FROM public.parents WHERE id=owner_id FOR UPDATE;
  SELECT * INTO payment FROM public.pending_payments WHERE order_id=p_order_id FOR UPDATE;
  IF payment.status IN ('completed','refunded') THEN RETURN false; END IF;
  IF coalesce(p_transaction_id,'')='' OR p_transaction_id IS DISTINCT FROM payment.charge_id THEN
    RAISE EXCEPTION 'Référence de paiement incohérente';
  END IF;
  IF jsonb_typeof(payment.cart_items) IS DISTINCT FROM 'array' OR jsonb_array_length(payment.cart_items)=0 THEN
    RAISE EXCEPTION 'Panier de paiement invalide';
  END IF;
  PERFORM set_config('app.checkout_order',p_order_id,true);
  PERFORM c.id FROM public.children c WHERE c.id IN
    (SELECT (i->>'child_id')::uuid FROM jsonb_array_elements(payment.cart_items) i) ORDER BY c.id FOR UPDATE;
  PERFORM pc.id FROM public.parent_credits pc WHERE pc.id IN
    (SELECT (i->>'credit_id')::uuid FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) i)
    ORDER BY pc.id FOR UPDATE;

  INSERT INTO public.reservations(parent_id,child_id,menu_id,date,supplements,annotations,
    total_price,payment_status,payment_intent_id,confirmed_daily_quantity,repeat_order_confirmed_at,source_cart_item_id)
  SELECT payment.parent_id,(i->>'child_id')::uuid,(i->>'menu_id')::uuid,(i->>'date')::date,
    coalesce(nullif(i->'supplements','null'),'[]'),i->>'annotations',(i->>'total_price')::numeric,
    'paid',p_transaction_id,coalesce((i->>'confirmed_daily_quantity')::integer,1),
    (i->>'repeat_order_confirmed_at')::timestamptz,(i->>'id')::uuid
  FROM jsonb_array_elements(payment.cart_items) i;

  FOR applied IN SELECT (c->>'credit_id')::uuid id,sum((c->>'amount')::numeric) amount,
    bool_and((c->>'amount')::numeric>0) valid
    FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) c GROUP BY (c->>'credit_id')::uuid
  LOOP
    IF applied.valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Montant de crédit invalide'; END IF;
    held := CASE WHEN payment.checkout_key IS NULL THEN 0 ELSE applied.amount END;
    UPDATE public.parent_credits SET used_amount=used_amount+applied.amount,reserved_amount=reserved_amount-held
      WHERE id=applied.id AND parent_id=payment.parent_id
        AND reserved_amount>=held AND used_amount+reserved_amount-held+applied.amount<=amount
        AND (held>0 OR is_active);
    IF NOT FOUND THEN RAISE EXCEPTION 'Crédit cagnotte indisponible pour cette commande'; END IF;
  END LOOP;
  DELETE FROM public.cart_items WHERE parent_id=payment.parent_id
    AND id IN(SELECT (i->>'id')::uuid FROM jsonb_array_elements(payment.cart_items) i);
  DELETE FROM public.meal_payment_holds WHERE order_id=p_order_id;
  UPDATE public.pending_payments SET status='completed',payzone_transaction_id=p_transaction_id,
    payzone_status=CASE WHEN total_amount=0 THEN 'CREDIT' ELSE 'CHARGED' END,
    completed_at=now(),failure_reason=NULL WHERE id=payment.id;
  PERFORM set_config('app.checkout_order','',true);
  RETURN true;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.prepare_meal_checkout(p_parent_id uuid, p_items jsonb, p_bank_amount numeric, p_credits jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cart_ids uuid[]; key text; payment public.pending_payments%ROWTYPE;
  snapshot jsonb; ci record; grouping record; credit record; subtotal numeric:=0;
  credit_total numeric:=0; supplement_total numeric; supplement_ids uuid[]; supplement_count integer;
  unit_price numeric; new_order text; new_charge text; stamp text; active_count integer; legacy_count integer; legacy public.pending_payments%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 OR
    jsonb_typeof(p_credits) IS DISTINCT FROM 'array' OR p_bank_amount IS NULL OR p_bank_amount<0 THEN
    RAISE EXCEPTION 'Paramètres de commande invalides';
  END IF;
  SELECT array_agg((i->>'id')::uuid ORDER BY i->>'id') INTO cart_ids FROM jsonb_array_elements(p_items) i;
  IF cardinality(cart_ids)<>(SELECT count(DISTINCT x) FROM unnest(cart_ids) x) THEN
    RAISE EXCEPTION 'Le panier contient une ligne répétée';
  END IF;
  PERFORM id FROM public.parents WHERE id=p_parent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent introuvable'; END IF;
  key:=md5(p_parent_id::text || array_to_string(cart_ids,','));
  SELECT * INTO payment FROM public.pending_payments WHERE checkout_key=key FOR UPDATE;
  IF FOUND THEN
    IF payment.status='refunded' THEN RAISE EXCEPTION 'Cette commande a déjà été remboursée'; END IF;
    RETURN to_jsonb(payment)||jsonb_build_object('reused',true);
  END IF;
  PERFORM c.id FROM public.children c JOIN public.cart_items cart_lock ON cart_lock.child_id=c.id
    WHERE cart_lock.id=ANY(cart_ids) ORDER BY c.id FOR UPDATE OF c;
  PERFORM id FROM public.cart_items WHERE id=ANY(cart_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.cart_items WHERE id=ANY(cart_ids) AND parent_id=p_parent_id)<>cardinality(cart_ids) THEN
    RAISE EXCEPTION 'Votre panier a changé ou cette commande a déjà été enregistrée';
  END IF;
  IF EXISTS(SELECT 1 FROM public.reservations WHERE source_cart_item_id=ANY(cart_ids)) THEN
    RAISE EXCEPTION 'Cette commande a déjà été enregistrée';
  END IF;
  -- Legacy paywalls remain capable of receiving a late bank callback. Reuse an
  -- exact old basket; never open a new charge while another old basket overlaps.
  SELECT count(*) INTO legacy_count FROM public.pending_payments p
    WHERE p.parent_id=p_parent_id AND p.checkout_key IS NULL AND p.status NOT IN ('completed','refunded')
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.cart_items) i JOIN public.cart_items c
        ON c.child_id=(i->>'child_id')::uuid AND c.date=(i->>'date')::date WHERE c.id=ANY(cart_ids));
  IF legacy_count>1 THEN RAISE EXCEPTION 'Plusieurs anciens paiements doivent être vérifiés. Contactez le support avant de recommencer'; END IF;
  IF legacy_count=1 THEN
    SELECT * INTO legacy FROM public.pending_payments p WHERE p.parent_id=p_parent_id
      AND p.checkout_key IS NULL AND p.status NOT IN ('completed','refunded')
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.cart_items) i JOIN public.cart_items c
        ON c.child_id=(i->>'child_id')::uuid AND c.date=(i->>'date')::date WHERE c.id=ANY(cart_ids)) FOR UPDATE;
    IF legacy.payzone_status='CHARGED' OR legacy.charge_id IS NULL OR
      (SELECT array_agg((i->>'id')::uuid ORDER BY i->>'id') FROM jsonb_array_elements(legacy.cart_items) i) IS DISTINCT FROM cart_ids
      OR legacy.total_amount IS DISTINCT FROM p_bank_amount OR legacy.applied_credits IS DISTINCT FROM p_credits THEN
      RAISE EXCEPTION 'Un ancien paiement doit être vérifié pour ces repas. Contactez le support avant de recommencer';
    END IF;
  END IF;
  snapshot:='[]';
  FOR ci IN SELECT x.*,c.first_name,c.last_name,c.parent_id child_parent,c.school_id child_school,
    m.school_id menu_school,m.date menu_date,m.available,m.price menu_price,m.meal_name,
    m.supplements enabled_supplements
    FROM public.cart_items x JOIN public.children c ON c.id=x.child_id JOIN public.menus m ON m.id=x.menu_id
    WHERE x.id=ANY(cart_ids) ORDER BY x.id
  LOOP
    IF ci.child_parent<>p_parent_id OR ci.child_school IS DISTINCT FROM ci.menu_school OR
      ci.menu_date<>ci.date OR NOT ci.available OR
      (now() AT TIME ZONE 'Africa/Casablanca') >= ci.date+time '07:00' THEN
      RAISE EXCEPTION 'Ce repas n’est plus disponible pour cet enfant à cette date';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) i WHERE i->>'id'=ci.id::text
      AND i->>'child_id'=ci.child_id::text AND i->>'menu_id'=ci.menu_id::text
      AND i->>'date'=ci.date::text AND (i->>'total_price')::numeric=ci.total_price) THEN
      RAISE EXCEPTION 'Votre panier a changé. Vérifiez-le avant de payer';
    END IF;
    SELECT coalesce(array_agg((s->>'id')::uuid),'{}') INTO supplement_ids
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ci.supplements)='array' THEN ci.supplements
        ELSE coalesce(ci.supplements->'items','[]') END) s;
    SELECT count(*),coalesce(sum(s.price),0) INTO supplement_count,supplement_total
      FROM public.provider_supplements s WHERE s.id=ANY(supplement_ids) AND s.available
      AND (s.menu_id=ci.menu_id OR to_jsonb(ci.enabled_supplements) ? s.id::text);
    IF supplement_count<>cardinality(supplement_ids) THEN RAISE EXCEPTION 'Supplément indisponible'; END IF;
    unit_price:=round(ci.menu_price+supplement_total,2);
    IF unit_price IS DISTINCT FROM ci.total_price OR unit_price<0 THEN
      RAISE EXCEPTION 'Le prix du repas a changé. Vérifiez votre panier';
    END IF;
    subtotal:=subtotal+unit_price;
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',ci.id,'child_id',ci.child_id,
      'menu_id',ci.menu_id,'date',ci.date,'total_price',unit_price,'supplements',ci.supplements,
      'annotations',ci.annotations,'confirmed_daily_quantity',ci.confirmed_daily_quantity,
      'repeat_order_confirmed_at',ci.repeat_order_confirmed_at,
      'child',jsonb_build_object('first_name',ci.first_name,'last_name',ci.last_name),
      'menu',jsonb_build_object('meal_name',ci.meal_name)));
  END LOOP;
  IF jsonb_array_length(snapshot)<>cardinality(cart_ids) THEN RAISE EXCEPTION 'Panier incomplet'; END IF;
  FOR grouping IN SELECT (i->>'child_id')::uuid child_id,(i->>'date')::date date,count(*) quantity,
    max(CASE WHEN nullif(i->>'repeat_order_confirmed_at','') IS NOT NULL THEN
      (i->>'confirmed_daily_quantity')::integer ELSE 1 END) approved,
    max(i->>'repeat_order_confirmed_at') confirmed_at
    FROM jsonb_array_elements(snapshot) i GROUP BY i->>'child_id',i->>'date'
  LOOP
    IF EXISTS(SELECT 1 FROM public.meal_payment_holds h WHERE h.child_id=grouping.child_id AND h.date=grouping.date) THEN
      RAISE EXCEPTION 'Un paiement est déjà en cours pour cet enfant ce jour-là. Reprenez le panier initial avant de recommencer';
    END IF;
    SELECT count(*) INTO active_count FROM public.reservations r WHERE r.child_id=grouping.child_id
      AND r.date=grouping.date AND r.payment_status IS DISTINCT FROM 'cancelled';
    IF active_count+grouping.quantity>grouping.approved THEN
      RAISE EXCEPTION 'Un repas est déjà commandé ou présent plusieurs fois. Confirmez le repas supplémentaire dans votre panier';
    END IF;
    -- Consent belongs to the group; all inserts carry it regardless of row order.
    SELECT jsonb_agg(CASE WHEN i->>'child_id'=grouping.child_id::text AND i->>'date'=grouping.date::text
      THEN i||jsonb_build_object('confirmed_daily_quantity',grouping.approved,'repeat_order_confirmed_at',grouping.confirmed_at)
      ELSE i END) INTO snapshot FROM jsonb_array_elements(snapshot) i;
  END LOOP;
  SELECT coalesce(sum((c->>'amount')::numeric),0) INTO credit_total FROM jsonb_array_elements(p_credits) c;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_credits) c WHERE coalesce((c->>'amount')::numeric,0)<=0)
    OR round(p_bank_amount,2)<>p_bank_amount OR round(credit_total,2)<>credit_total
    OR subtotal<>p_bank_amount+credit_total THEN RAISE EXCEPTION 'Le total ou la cagnotte a changé. Vérifiez votre panier'; END IF;
  stamp:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text;
  new_charge:=CASE WHEN p_bank_amount=0 THEN 'CRD_' ELSE 'CHG_' END||stamp||'_'||substr(md5(key),1,8);
  new_order:=CASE WHEN p_bank_amount=0 THEN new_charge ELSE 'CK_'||stamp||'_'||left(p_parent_id::text,8) END;
  IF legacy_count=1 THEN new_order:=legacy.order_id; new_charge:=legacy.charge_id; END IF;
  PERFORM set_config('app.checkout_order',new_order,true);
  PERFORM pc.id FROM public.parent_credits pc WHERE pc.id IN
    (SELECT (c->>'credit_id')::uuid FROM jsonb_array_elements(p_credits) c) ORDER BY pc.id FOR UPDATE;
  FOR credit IN SELECT (c->>'credit_id')::uuid id,sum((c->>'amount')::numeric) amount
    FROM jsonb_array_elements(p_credits) c GROUP BY (c->>'credit_id')::uuid
  LOOP
    UPDATE public.parent_credits SET reserved_amount=reserved_amount+credit.amount
      WHERE id=credit.id AND parent_id=p_parent_id AND is_active
        AND amount-used_amount-reserved_amount>=credit.amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Crédit cagnotte indisponible. Actualisez votre panier'; END IF;
  END LOOP;
  INSERT INTO public.pending_payments(order_id,charge_id,parent_id,cart_items,total_amount,status,applied_credits,checkout_key,expires_at)
    VALUES(new_order,new_charge,p_parent_id,snapshot,p_bank_amount,'pending',p_credits,key,NULL)
    ON CONFLICT(order_id) DO UPDATE SET cart_items=EXCLUDED.cart_items,checkout_key=EXCLUDED.checkout_key,expires_at=NULL;
  INSERT INTO public.meal_payment_holds(child_id,date,order_id)
    SELECT DISTINCT (i->>'child_id')::uuid,(i->>'date')::date,new_order FROM jsonb_array_elements(snapshot) i;
  IF p_bank_amount=0 THEN PERFORM public.complete_payzone_payment(new_order,new_charge); END IF;
  SELECT * INTO payment FROM public.pending_payments WHERE order_id=new_order;
  PERFORM set_config('app.checkout_order','',true);
  RETURN to_jsonb(payment)||jsonb_build_object('reused',false);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cancel_meal_with_credit(p_reservation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.reservations%ROWTYPE; owner_id uuid; credit_id uuid; week_start date;
BEGIN
  owner_id:=public.current_parent_id();
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  PERFORM id FROM public.parents WHERE id=owner_id FOR UPDATE;
  SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id AND parent_id=owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable'; END IF;
  SELECT id INTO credit_id FROM public.parent_credits WHERE source_reservation_id=r.id;
  IF credit_id IS NOT NULL THEN RETURN credit_id; END IF;
  IF r.payment_status IS DISTINCT FROM 'paid' OR r.created_by_school OR r.school_payment_pending THEN
    RAISE EXCEPTION 'Cette réservation ne peut pas être annulée par cagnotte';
  END IF;
  IF (now() AT TIME ZONE 'Africa/Casablanca')>=r.date+time '07:00' THEN
    RAISE EXCEPTION 'L’annulation n’est plus possible après 7 h le jour du repas';
  END IF;
  week_start:=date_trunc('week',r.date)::date;
  IF (SELECT count(*) FROM public.parent_credits WHERE parent_id=owner_id AND meal_week_start_date=week_start)>=2 THEN
    RAISE EXCEPTION 'La limite de deux annulations pour cette semaine est atteinte';
  END IF;
  PERFORM set_config('app.checkout_order','CANCEL_'||r.id::text,true);
  UPDATE public.reservations SET payment_status='cancelled',cancelled_at=now() WHERE id=r.id;
  INSERT INTO public.parent_credits(parent_id,amount,used_amount,source_reservation_id,meal_week_start_date,reason,source_reference)
    VALUES(owner_id,r.total_price,0,r.id,week_start,'Annulation de repas','CANCEL_'||r.id::text) RETURNING id INTO credit_id;
  PERFORM set_config('app.checkout_order','',true);
  RETURN credit_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.refund_payzone_payment(p_order_id text, p_transaction_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE payment public.pending_payments%ROWTYPE; owner_id uuid; applied record;
BEGIN
  SELECT parent_id INTO owner_id FROM public.pending_payments WHERE order_id=p_order_id;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  PERFORM id FROM public.parents WHERE id=owner_id FOR UPDATE;
  SELECT * INTO payment FROM public.pending_payments WHERE order_id=p_order_id FOR UPDATE;
  IF payment.status='refunded' THEN RETURN false; END IF;
  IF p_transaction_id IS DISTINCT FROM payment.charge_id OR coalesce(p_transaction_id,'')='' THEN
    RAISE EXCEPTION 'Référence de remboursement incohérente';
  END IF;
  PERFORM id FROM public.reservations WHERE payment_intent_id=p_transaction_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.parent_credits c JOIN public.reservations r ON r.id=c.source_reservation_id
    WHERE r.payment_intent_id=p_transaction_id) THEN
    RAISE EXCEPTION 'Un avoir existe déjà pour cette commande. Rapprochement manuel requis pour éviter un double remboursement';
  END IF;
  IF payment.checkout_key IS NULL AND payment.status<>'completed' AND
    EXISTS(SELECT 1 FROM public.reservations WHERE payment_intent_id=p_transaction_id) THEN
    RAISE EXCEPTION 'Ancienne commande partiellement enregistrée : rapprochement manuel requis';
  END IF;
  PERFORM set_config('app.checkout_order',p_order_id,true);
  PERFORM id FROM public.parent_credits WHERE id IN
    (SELECT (c->>'credit_id')::uuid FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) c)
    ORDER BY id FOR UPDATE;
  FOR applied IN SELECT (c->>'credit_id')::uuid id,sum((c->>'amount')::numeric) amount
    FROM jsonb_array_elements(coalesce(payment.applied_credits,'[]')) c GROUP BY c->>'credit_id'
  LOOP
    IF applied.amount IS NULL OR applied.amount<=0 THEN RAISE EXCEPTION 'Crédit invalide'; END IF;
    IF payment.status='completed' THEN
      UPDATE public.parent_credits SET used_amount=used_amount-applied.amount
        WHERE id=applied.id AND parent_id=owner_id AND used_amount>=applied.amount;
      IF NOT FOUND THEN RAISE EXCEPTION 'Crédit à rapprocher avant restitution'; END IF;
    ELSIF payment.checkout_key IS NOT NULL THEN
      UPDATE public.parent_credits SET reserved_amount=reserved_amount-applied.amount
        WHERE id=applied.id AND parent_id=owner_id AND reserved_amount>=applied.amount;
      IF NOT FOUND THEN RAISE EXCEPTION 'Crédit réservé à rapprocher'; END IF;
    END IF;
  END LOOP;
  UPDATE public.reservations SET payment_status='cancelled',cancelled_at=coalesce(cancelled_at,now())
    WHERE payment_intent_id=p_transaction_id;
  DELETE FROM public.meal_payment_holds WHERE order_id=p_order_id;
  -- A refunded checkout's original cart ids must not reopen a bank form.
  DELETE FROM public.cart_items WHERE parent_id=owner_id AND id IN
    (SELECT (i->>'id')::uuid FROM jsonb_array_elements(payment.cart_items) i);
  UPDATE public.pending_payments SET status='refunded',payzone_status='REFUNDED',
    refunded_at=now(),failure_reason=NULL WHERE order_id=p_order_id;
  PERFORM set_config('app.checkout_order','',true);
  RETURN true;
END;
$function$
;
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_update_push_token_timestamp BEFORE UPDATE ON public.user_push_tokens FOR EACH ROW EXECUTE FUNCTION update_push_token_timestamp();
CREATE TRIGGER trigger_update_notification_pref_timestamp BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION update_push_token_timestamp();
CREATE TRIGGER validate_child_school_change BEFORE INSERT OR UPDATE OF school_id, grade ON public.children FOR EACH ROW EXECUTE FUNCTION validate_child_school_change();
CREATE TRIGGER guard_duplicate_reservation_meal BEFORE INSERT OR UPDATE OF child_id, menu_id, date, payment_status ON public.reservations FOR EACH ROW EXECUTE FUNCTION guard_duplicate_meal_order();
CREATE TRIGGER guard_duplicate_cart_meal BEFORE INSERT OR UPDATE OF child_id, menu_id, date, confirmed_daily_quantity ON public.cart_items FOR EACH ROW EXECUTE FUNCTION guard_duplicate_meal_order();
CREATE TRIGGER record_credit_movement AFTER INSERT OR DELETE OR UPDATE ON public.parent_credits FOR EACH ROW EXECUTE FUNCTION record_credit_movement();
CREATE TRIGGER guard_locked_cart_item BEFORE DELETE OR UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION guard_locked_cart_item();
CREATE TRIGGER guard_payment_reservation_hold BEFORE INSERT OR UPDATE OF child_id, date, payment_status ON public.reservations FOR EACH ROW EXECUTE FUNCTION guard_payment_reservation_hold();
ALTER TABLE public."managed_account_passwords" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."credit_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."children" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."parents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."menus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."school_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."provider_supplements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."parent_registration_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pending_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."provider_registration_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."provider_school_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."parent_school_affiliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."provider_week_plan_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."parent_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."provider_week_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."provider_menu_library" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."school_registration_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notification_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_push_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."provider_menu_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meal_payment_holds" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "macp_admin_all" ON public."managed_account_passwords" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "credit_movements_read" ON public."credit_movements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((parent_id = current_parent_id()) OR is_admin()));
CREATE POLICY "children_delete_admin" ON public."children" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin());
CREATE POLICY "children_delete_parent" ON public."children" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((parent_id = current_parent_id()));
CREATE POLICY "children_insert_admin" ON public."children" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_admin());
CREATE POLICY "children_insert_parent" ON public."children" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((parent_id = current_parent_id()));
CREATE POLICY "children_select_admin" ON public."children" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin());
CREATE POLICY "children_select_own_parent" ON public."children" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((parent_id = current_parent_id()));
CREATE POLICY "children_select_provider" ON public."children" AS PERMISSIVE FOR SELECT TO "authenticated" USING (provider_can_read_child(id));
CREATE POLICY "children_select_school" ON public."children" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((school_id = current_school_id()));
CREATE POLICY "children_select_school_orders" ON public."children" AS PERMISSIVE FOR SELECT TO "authenticated" USING (school_can_read_child_orders(id));
CREATE POLICY "children_update_admin" ON public."children" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "children_update_parent" ON public."children" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((parent_id = current_parent_id())) WITH CHECK ((parent_id = current_parent_id()));
CREATE POLICY "parents_delete_admin" ON public."parents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin());
CREATE POLICY "parents_insert_admin" ON public."parents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_admin() OR (user_id = auth.uid())));
CREATE POLICY "parents_select_admin" ON public."parents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin());
CREATE POLICY "parents_select_provider" ON public."parents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (provider_can_read_parent(id));
CREATE POLICY "parents_select_school" ON public."parents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM children c
  WHERE ((c.parent_id = parents.id) AND (c.school_id = current_school_id())))));
CREATE POLICY "parents_select_school_orders" ON public."parents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (school_can_read_parent_orders(id));
CREATE POLICY "parents_select_self" ON public."parents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));
CREATE POLICY "parents_update_admin" ON public."parents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "parents_update_self" ON public."parents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "cart_items_admin_select" ON public."cart_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin());
CREATE POLICY "cart_items_owner_all" ON public."cart_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((parent_id = current_parent_id())) WITH CHECK ((parent_id = current_parent_id()));
CREATE POLICY "supplements_select_authenticated" ON public."supplements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "supplements_write_admin" ON public."supplements" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "supplements_write_school" ON public."supplements" AS PERMISSIVE FOR ALL TO "authenticated" USING ((school_id = current_school_id())) WITH CHECK ((school_id = current_school_id()));
CREATE POLICY "menus_delete_admin" ON public."menus" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin());
CREATE POLICY "menus_delete_provider" ON public."menus" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((provider_id = current_provider_id()));
CREATE POLICY "menus_insert_admin" ON public."menus" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_admin());
CREATE POLICY "menus_insert_provider" ON public."menus" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((provider_id = current_provider_id()));
CREATE POLICY "menus_select_authenticated" ON public."menus" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "menus_update_admin" ON public."menus" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "menus_update_provider" ON public."menus" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((provider_id = current_provider_id())) WITH CHECK ((provider_id = current_provider_id()));
CREATE POLICY "School users can create provider relationships" ON public."school_providers" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = school_providers.school_id) AND (schools.access_code = current_setting('app.current_access_code'::text, true)) AND (schools.is_school_user = true)))));
CREATE POLICY "School users can update provider relationships" ON public."school_providers" AS PERMISSIVE FOR UPDATE TO "public" USING ((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = school_providers.school_id) AND (schools.access_code = current_setting('app.current_access_code'::text, true)) AND (schools.is_school_user = true)))));
CREATE POLICY "School users can view their provider relationships" ON public."school_providers" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = school_providers.school_id) AND (schools.access_code = current_setting('app.current_access_code'::text, true))))));
CREATE POLICY "Admins can manage all supplements" ON public."provider_supplements" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Parents can view supplements for their children's schools" ON public."provider_supplements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((available = true) AND (school_id IN ( SELECT DISTINCT children.school_id
   FROM (children
     JOIN parents ON ((children.parent_id = parents.id)))
  WHERE (parents.user_id = auth.uid())))));
CREATE POLICY "Providers can delete their own supplements" ON public."provider_supplements" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "Providers can insert their own supplements" ON public."provider_supplements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "Providers can update their own supplements" ON public."provider_supplements" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid())))) WITH CHECK ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "Providers can view their own supplements" ON public."provider_supplements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "Schools can view supplements from their providers" ON public."provider_supplements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((available = true) AND (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "Admins can manage parent registration codes" ON public."parent_registration_codes" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Authenticated users can view active parent codes" ON public."parent_registration_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_active = true));
CREATE POLICY "Parents can view own pending payments" ON public."pending_payments" AS PERMISSIVE FOR SELECT TO "public" USING ((parent_id IN ( SELECT parents.id
   FROM parents
  WHERE (parents.user_id = auth.uid()))));
CREATE POLICY "Service can manage pending payments" ON public."pending_payments" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Admins can create provider registration codes" ON public."provider_registration_codes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Admins can update all provider registration codes" ON public."provider_registration_codes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Admins can update provider registration codes" ON public."provider_registration_codes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Admins can view all provider registration codes" ON public."provider_registration_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Admins can view provider registration codes" ON public."provider_registration_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Anyone can view active provider registration codes" ON public."provider_registration_codes" AS PERMISSIVE FOR SELECT TO "anon" USING ((is_active = true));
CREATE POLICY "Authenticated users can view active provider registration codes" ON public."provider_registration_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_active = true));
CREATE POLICY "Providers can add school access" ON public."provider_school_access" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "Providers can view their school access" ON public."provider_school_access" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "Schools can grant provider access" ON public."provider_school_access" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Schools can revoke provider access" ON public."provider_school_access" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Schools can view their provider access" ON public."provider_school_access" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "prov_access_delete_admin" ON public."provider_school_access" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "prov_access_select_admin" ON public."provider_school_access" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Parents can insert their own affiliations" ON public."parent_school_affiliations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((parent_id IN ( SELECT parents.id
   FROM parents
  WHERE (parents.user_id = auth.uid()))));
CREATE POLICY "Parents can view their own affiliations" ON public."parent_school_affiliations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((parent_id IN ( SELECT parents.id
   FROM parents
  WHERE (parents.user_id = auth.uid()))));
CREATE POLICY "psa_select_admin" ON public."parent_school_affiliations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Providers can manage their own week plan days" ON public."provider_week_plan_days" AS PERMISSIVE FOR ALL TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid())))) WITH CHECK ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "parent_credits_admin_all" ON public."parent_credits" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "parent_credits_delete_provider" ON public."parent_credits" AS PERMISSIVE FOR DELETE TO "authenticated" USING (provider_can_manage_parent(parent_id));
CREATE POLICY "parent_credits_insert_provider" ON public."parent_credits" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (provider_can_manage_parent(parent_id));
CREATE POLICY "parent_credits_select_admin" ON public."parent_credits" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin());
CREATE POLICY "parent_credits_select_provider" ON public."parent_credits" AS PERMISSIVE FOR SELECT TO "authenticated" USING (provider_can_manage_parent(parent_id));
CREATE POLICY "parent_credits_select_self" ON public."parent_credits" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((parent_id IN ( SELECT parents.id
   FROM parents
  WHERE (parents.user_id = auth.uid()))));
CREATE POLICY "parent_credits_update_provider" ON public."parent_credits" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (provider_can_manage_parent(parent_id)) WITH CHECK (provider_can_manage_parent(parent_id));
CREATE POLICY "Providers can manage their own week plans" ON public."provider_week_plans" AS PERMISSIVE FOR ALL TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid())))) WITH CHECK ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "Providers can manage their own menu library" ON public."provider_menu_library" AS PERMISSIVE FOR ALL TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid())))) WITH CHECK ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "Admins can create school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Admins can delete school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Admins can update all school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Admins can view all school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Anonymous users can view active school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR SELECT TO "anon" USING ((is_active = true));
CREATE POLICY "Anyone can read active registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR SELECT TO "public" USING ((is_active = true));
CREATE POLICY "Authenticated users can view active school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_active = true));
CREATE POLICY "Providers can create school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((provider_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM providers
  WHERE (providers.user_id = auth.uid())))));
CREATE POLICY "Providers can update their own school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((provider_user_id = auth.uid())) WITH CHECK ((provider_user_id = auth.uid()));
CREATE POLICY "Providers can view their own school registration codes" ON public."school_registration_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((provider_user_id = auth.uid()));
CREATE POLICY "notification_logs_select_admin" ON public."notification_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin());
CREATE POLICY "notification_logs_select_self" ON public."notification_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = current_parent_id()) OR (user_id = current_provider_id()) OR (user_id = current_school_id())));
CREATE POLICY "notification_prefs_admin_all" ON public."notification_preferences" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "notification_prefs_owner_all" ON public."notification_preferences" AS PERMISSIVE FOR ALL TO "authenticated" USING (((user_id = current_parent_id()) OR (user_id = current_provider_id()) OR (user_id = current_school_id()))) WITH CHECK (((user_id = current_parent_id()) OR (user_id = current_provider_id()) OR (user_id = current_school_id())));
CREATE POLICY "push_tokens_admin_all" ON public."user_push_tokens" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "push_tokens_delete_self" ON public."user_push_tokens" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((user_id = current_parent_id()) OR (user_id = current_provider_id()) OR (user_id = current_school_id())));
CREATE POLICY "push_tokens_insert_self" ON public."user_push_tokens" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id = current_parent_id()) OR (user_id = current_provider_id()) OR (user_id = current_school_id())));
CREATE POLICY "push_tokens_select_self" ON public."user_push_tokens" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = current_parent_id()) OR (user_id = current_provider_id()) OR (user_id = current_school_id())));
CREATE POLICY "push_tokens_update_self" ON public."user_push_tokens" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((user_id = current_parent_id()) OR (user_id = current_provider_id()) OR (user_id = current_school_id()))) WITH CHECK (((user_id = current_parent_id()) OR (user_id = current_provider_id()) OR (user_id = current_school_id())));
CREATE POLICY "Admins can view all providers" ON public."providers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Authenticated users can insert provider with valid code" ON public."providers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((registration_code IN ( SELECT provider_registration_codes.code
   FROM provider_registration_codes
  WHERE (provider_registration_codes.is_active = true))));
CREATE POLICY "Providers can update own data" ON public."providers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Providers can view own data" ON public."providers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "School users can update their providers" ON public."providers" AS PERMISSIVE FOR UPDATE TO "public" USING ((EXISTS ( SELECT 1
   FROM (school_providers sp
     JOIN schools s ON ((s.id = sp.school_id)))
  WHERE ((sp.provider_id = providers.id) AND (s.access_code = current_setting('app.current_access_code'::text, true))))));
CREATE POLICY "School users can view their providers" ON public."providers" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM (school_providers sp
     JOIN schools s ON ((s.id = sp.school_id)))
  WHERE ((sp.provider_id = providers.id) AND (s.access_code = current_setting('app.current_access_code'::text, true))))));
CREATE POLICY "providers_insert_admin" ON public."providers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "providers_update_admin" ON public."providers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM parents
  WHERE ((parents.user_id = auth.uid()) AND (parents.is_admin = true)))));
CREATE POLICY "Providers can manage their own menu templates" ON public."provider_menu_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid())))) WITH CHECK ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "provider_menu_templates_policy" ON public."provider_menu_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid())))) WITH CHECK ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
CREATE POLICY "schools_delete_admin" ON public."schools" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin());
CREATE POLICY "schools_insert_admin" ON public."schools" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_admin());
CREATE POLICY "schools_select_anon" ON public."schools" AS PERMISSIVE FOR SELECT TO "anon" USING (true);
CREATE POLICY "schools_select_authenticated" ON public."schools" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "schools_update_self_or_admin" ON public."schools" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((user_id = auth.uid()) OR is_admin())) WITH CHECK (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY "reservations_delete_admin" ON public."reservations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin());
CREATE POLICY "reservations_insert_admin" ON public."reservations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_admin());
CREATE POLICY "reservations_insert_school" ON public."reservations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM children c
  WHERE ((c.id = reservations.child_id) AND (c.school_id = current_school_id())))));
CREATE POLICY "reservations_select_admin" ON public."reservations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin());
CREATE POLICY "reservations_select_parent" ON public."reservations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((parent_id = current_parent_id()));
CREATE POLICY "reservations_select_provider" ON public."reservations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM menus m
  WHERE ((m.id = reservations.menu_id) AND (m.provider_id = current_provider_id())))));
CREATE POLICY "reservations_select_school" ON public."reservations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM menus m
  WHERE ((m.id = reservations.menu_id) AND (m.school_id = current_school_id())))));
CREATE POLICY "reservations_update_admin" ON public."reservations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "reservations_update_school" ON public."reservations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM menus m
  WHERE ((m.id = reservations.menu_id) AND (m.school_id = current_school_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM menus m
  WHERE ((m.id = reservations.menu_id) AND (m.school_id = current_school_id())))));
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public."provider_can_manage_parent"(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."provider_can_manage_parent"(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public."provider_can_manage_parent"(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public."provider_can_manage_parent"(uuid) TO service_role;
REVOKE ALL ON FUNCTION public."school_can_read_child_orders"(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."school_can_read_child_orders"(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public."school_can_read_child_orders"(uuid) TO service_role;
REVOKE ALL ON FUNCTION public."school_can_read_parent_orders"(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."school_can_read_parent_orders"(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public."school_can_read_parent_orders"(uuid) TO service_role;
REVOKE ALL ON FUNCTION public."provider_managed_parents"() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."provider_managed_parents"() TO anon;
GRANT EXECUTE ON FUNCTION public."provider_managed_parents"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."provider_managed_parents"() TO service_role;
REVOKE ALL ON FUNCTION public."get_provider_school_students"() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."get_provider_school_students"() TO anon;
GRANT EXECUTE ON FUNCTION public."get_provider_school_students"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."get_provider_school_students"() TO service_role;
REVOKE ALL ON FUNCTION public."get_provider_school_student_count"() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."get_provider_school_student_count"() TO anon;
GRANT EXECUTE ON FUNCTION public."get_provider_school_student_count"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."get_provider_school_student_count"() TO service_role;
REVOKE ALL ON FUNCTION public."validate_child_school_change"() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."validate_child_school_change"() TO anon;
GRANT EXECUTE ON FUNCTION public."validate_child_school_change"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."validate_child_school_change"() TO service_role;
REVOKE ALL ON FUNCTION public."guard_duplicate_meal_order"() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."guard_duplicate_meal_order"() TO service_role;
REVOKE ALL ON FUNCTION public."record_credit_movement"() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."record_credit_movement"() TO service_role;
REVOKE ALL ON FUNCTION public."guard_locked_cart_item"() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."guard_locked_cart_item"() TO service_role;
REVOKE ALL ON FUNCTION public."guard_payment_reservation_hold"() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."guard_payment_reservation_hold"() TO service_role;
REVOKE ALL ON FUNCTION public."complete_payzone_payment"(text, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."complete_payzone_payment"(text, text) TO service_role;
REVOKE ALL ON FUNCTION public."prepare_meal_checkout"(uuid, jsonb, numeric, jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."prepare_meal_checkout"(uuid, jsonb, numeric, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public."cancel_meal_with_credit"(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."cancel_meal_with_credit"(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public."cancel_meal_with_credit"(uuid) TO service_role;
REVOKE ALL ON FUNCTION public."refund_payzone_payment"(text, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public."refund_payzone_payment"(text, text) TO service_role;