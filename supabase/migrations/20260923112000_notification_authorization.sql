BEGIN;
ALTER TABLE public.user_push_tokens ADD COLUMN session_id uuid;
-- Existing tokens have no verifiable session/device binding. Re-register on next app open.
UPDATE public.user_push_tokens SET is_active=false WHERE session_id IS NULL;
CREATE OR REPLACE FUNCTION public.register_session_push_token(p_token text, p_user_id uuid, p_user_type text, p_device_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session uuid := nullif(auth.jwt()->>'session_id','')::uuid; v_allowed boolean;
BEGIN
 IF auth.uid() IS NULL OR v_session IS NULL OR NOT public.session_account_enabled()
    OR NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id=v_session AND user_id=auth.uid()) THEN
   RAISE EXCEPTION 'Session active requise.' USING ERRCODE='42501';
 END IF;
 v_allowed := CASE p_user_type
   WHEN 'parent' THEN p_user_id=public.current_parent_id()
   WHEN 'admin' THEN p_user_id=public.current_parent_id() AND public.is_admin()
   WHEN 'school' THEN p_user_id=public.current_school_id()
   WHEN 'provider' THEN p_user_id=public.current_provider_id() ELSE false END;
 IF v_allowed IS NOT TRUE OR p_device_type NOT IN ('ios','android','web')
    OR p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' OR length(p_token)>255 THEN
   RAISE EXCEPTION 'Appareil ou compte invalide.' USING ERRCODE='42501';
 END IF;
 -- Possession of the opaque Expo token identifies this installation. Rebinding it
 -- atomically prevents a shared phone from remaining attached to the previous family.
 INSERT INTO public.user_push_tokens(user_id,user_type,push_token,provider,device_type,is_active,last_used_at,session_id)
 VALUES(p_user_id,p_user_type,p_token,'expo',p_device_type,true,now(),v_session)
 ON CONFLICT(push_token) DO UPDATE SET user_id=excluded.user_id,user_type=excluded.user_type,
   device_type=excluded.device_type,is_active=true,last_used_at=now(),session_id=v_session;
END $$;
CREATE OR REPLACE FUNCTION public.revoke_session_push_tokens()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise.' USING ERRCODE='42501'; END IF;
 UPDATE public.user_push_tokens SET is_active=false
 WHERE session_id=nullif(auth.jwt()->>'session_id','')::uuid;
END $$;
REVOKE ALL ON FUNCTION public.register_session_push_token(text,uuid,text,text), public.revoke_session_push_tokens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_session_push_token(text,uuid,text,text), public.revoke_session_push_tokens() TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.user_push_tokens FROM authenticated;

CREATE OR REPLACE FUNCTION public.active_push_recipients(p_user_ids uuid[], p_user_type text)
RETURNS TABLE(push_token text,user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT t.push_token,t.user_id FROM public.user_push_tokens t JOIN auth.sessions s ON s.id=t.session_id
 WHERE t.is_active AND t.user_id=ANY(p_user_ids) AND (p_user_type IS NULL OR t.user_type=p_user_type)
 AND NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.user_id=s.user_id AND p.is_active IS NOT TRUE)
 AND (EXISTS (SELECT 1 FROM public.parents p WHERE p.id=t.user_id AND p.user_id=s.user_id AND t.user_type IN ('parent','admin'))
   OR EXISTS (SELECT 1 FROM public.schools p WHERE p.id=t.user_id AND p.user_id=s.user_id AND t.user_type='school')
   OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id=t.user_id AND p.user_id=s.user_id AND t.user_type='provider' AND p.is_active));
$$;
REVOKE ALL ON FUNCTION public.active_push_recipients(uuid[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.active_push_recipients(uuid[],text) TO service_role;

-- Client initiated notifications must correspond to a recorded database event.
CREATE TABLE public.menu_notification_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), menu_id uuid NOT NULL, school_id uuid NOT NULL,
 actor_user_id uuid, title text NOT NULL, body text NOT NULL, data jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_notification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT,UPDATE ON public.menu_notification_events TO service_role;
CREATE OR REPLACE FUNCTION public.record_deleted_menu_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
   INSERT INTO public.menu_notification_events(menu_id,school_id,actor_user_id,title,body,data)
   VALUES(OLD.id,OLD.school_id,auth.uid(),'Menu supprimé',
     format('Le menu « %s » du %s a été supprimé.',OLD.meal_name,OLD.date),
     jsonb_build_object('menuName',OLD.meal_name,'date',OLD.date));
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER record_deleted_menu_notification AFTER DELETE ON public.menus
 FOR EACH ROW EXECUTE FUNCTION public.record_deleted_menu_notification();
CREATE OR REPLACE FUNCTION public.claim_menu_notification_events(p_menu_ids uuid[], p_actor uuid)
RETURNS SETOF public.menu_notification_events LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.menu_notification_events SET state='sending'
 WHERE menu_id=ANY(p_menu_ids) AND actor_user_id=p_actor AND state='pending'
 RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_menu_notification_events(uuid[],uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_menu_notification_events(uuid[],uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_deleted_menu_notification() FROM PUBLIC,anon,authenticated;
COMMIT;
