CREATE TABLE public.trip_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  distance_mi double precision,
  duration_min double precision,
  truck_type text,
  trailer_type text,
  safety_score integer,
  hazard_count integer,
  weather_alerts integer,
  fuel_cost numeric,
  notes text,
  started_at timestamptz,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_logs TO authenticated;
GRANT ALL ON public.trip_logs TO service_role;

ALTER TABLE public.trip_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own trips select" ON public.trip_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own trips insert" ON public.trip_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own trips update" ON public.trip_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own trips delete" ON public.trip_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX trip_logs_user_completed_idx ON public.trip_logs (user_id, completed_at DESC);

-- Cascade cleanup when account is deleted via existing delete_current_user()
CREATE OR REPLACE FUNCTION public.delete_current_user()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.favorite_locations WHERE user_id = uid;
  DELETE FROM public.saved_routes       WHERE user_id = uid;
  DELETE FROM public.trip_logs          WHERE user_id = uid;
  DELETE FROM public.user_roles         WHERE user_id = uid;
  DELETE FROM public.profiles           WHERE id      = uid;
  UPDATE public.hazard_reports SET reporter_id = NULL WHERE reporter_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$function$;