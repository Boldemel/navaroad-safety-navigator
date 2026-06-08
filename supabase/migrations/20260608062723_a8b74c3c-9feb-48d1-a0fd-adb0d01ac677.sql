
ALTER TABLE public.trip_logs
  ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_unit text,
  ADD COLUMN IF NOT EXISTS route_date date,
  ADD COLUMN IF NOT EXISTS state_mileage jsonb;

CREATE INDEX IF NOT EXISTS idx_trip_logs_load ON public.trip_logs(load_id);

ALTER TABLE public.ifta_entries
  ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ifta_entries_load ON public.ifta_entries(load_id);
CREATE INDEX IF NOT EXISTS idx_ifta_entries_trip ON public.ifta_entries(trip_log_id);
CREATE UNIQUE INDEX IF NOT EXISTS ifta_entries_unique_trip_state
  ON public.ifta_entries(trip_log_id, state_code) WHERE trip_log_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_ifta_from_trip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  s_code text;
  s_miles numeric;
  s_gallons numeric;
  effective_date date;
BEGIN
  DELETE FROM public.ifta_entries WHERE trip_log_id = NEW.id;

  IF NEW.state_mileage IS NULL OR jsonb_typeof(NEW.state_mileage) <> 'array' THEN
    RETURN NEW;
  END IF;

  effective_date := COALESCE(NEW.route_date, NEW.completed_at::date, CURRENT_DATE);

  FOR item IN SELECT * FROM jsonb_array_elements(NEW.state_mileage) LOOP
    s_code := upper(NULLIF(item->>'state', ''));
    s_miles := COALESCE((item->>'miles')::numeric, 0);
    s_gallons := COALESCE((item->>'gallons')::numeric, 0);
    CONTINUE WHEN s_code IS NULL OR char_length(s_code) NOT BETWEEN 2 AND 3 OR s_miles <= 0;
    INSERT INTO public.ifta_entries
      (user_id, company_id, trip_log_id, load_id, entry_date, state_code, miles, fuel_gallons)
    VALUES
      (NEW.user_id, NEW.company_id, NEW.id, NEW.load_id, effective_date, s_code, s_miles, s_gallons);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_logs_sync_ifta ON public.trip_logs;
CREATE TRIGGER trip_logs_sync_ifta
AFTER INSERT OR UPDATE OF state_mileage, load_id, route_date, completed_at
ON public.trip_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_ifta_from_trip();
