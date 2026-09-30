-- Morocco returned permanently to GMT on 2026-09-20 at 02:00 old local time
-- (01:00 UTC), per decree 2.26.530 and IANA tzdb 2026c.
-- Older PostgreSQL tzdata still adds an hour. Keep the legal rule explicit until
-- every runtime has current timezone data; preserve historical conversions.
-- Source: https://data.iana.org/time-zones/tzdb/africa
BEGIN;

CREATE OR REPLACE FUNCTION public.morocco_local_time(p_at timestamptz)
RETURNS timestamp
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN p_at >= timestamptz '2026-09-20 01:00:00+00'
    THEN p_at AT TIME ZONE 'UTC'
    ELSE p_at AT TIME ZONE 'Africa/Casablanca'
  END;
$function$;

REVOKE ALL ON FUNCTION public.morocco_local_time(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.morocco_local_time(timestamptz) TO authenticated, service_role;

-- Patch only the time conversion in the CURRENT deployed definitions. In
-- particular, retain checkout recovery, credit accounting and all permissions.
DO $migration$
DECLARE
  signature text;
  definition text;
  patched text;
  old_conversion text := 'now() AT TIME ZONE ''Africa/Casablanca''';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.prepare_meal_checkout(uuid,jsonb,numeric,jsonb)',
    'public.cancel_meal_with_credit(uuid)',
    'public.resume_meal_checkout(uuid,text)'
  ] LOOP
    -- Checkout recovery was introduced after the original atomic checkout.
    IF signature = 'public.resume_meal_checkout(uuid,text)'
      AND to_regprocedure(signature) IS NULL THEN CONTINUE; END IF;
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF strpos(definition, old_conversion) > 0 THEN
      patched := replace(definition, old_conversion, 'public.morocco_local_time(now())');
      EXECUTE patched;
    ELSIF strpos(definition, 'public.morocco_local_time(now())') = 0 THEN
      RAISE EXCEPTION 'Unexpected time validation in %, migration aborted', signature;
    END IF;
  END LOOP;
END;
$migration$;

COMMIT;
