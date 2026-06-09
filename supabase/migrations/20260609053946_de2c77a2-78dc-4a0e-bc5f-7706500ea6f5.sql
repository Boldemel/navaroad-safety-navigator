
-- Truck/driver tracking columns across modules
ALTER TABLE public.ifta_entries
  ADD COLUMN IF NOT EXISTS vehicle_unit text,
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS vehicle_unit text,
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text;

-- Backfill driver_id where user_id is the driver
UPDATE public.ifta_entries  SET driver_id = user_id WHERE driver_id IS NULL;
UPDATE public.expenses      SET driver_id = user_id WHERE driver_id IS NULL;
UPDATE public.loads         SET driver_id = user_id WHERE driver_id IS NULL;
UPDATE public.inspections   SET driver_id = user_id WHERE driver_id IS NULL;
UPDATE public.documents     SET driver_id = user_id WHERE driver_id IS NULL;

-- Backfill vehicle_unit from related sources
UPDATE public.ifta_entries ie
   SET vehicle_unit = tl.vehicle_unit
  FROM public.trip_logs tl
 WHERE ie.trip_log_id = tl.id AND ie.vehicle_unit IS NULL AND tl.vehicle_unit IS NOT NULL;

UPDATE public.ifta_entries ie
   SET vehicle_unit = fp.vehicle_unit
  FROM public.fuel_purchases fp
 WHERE ie.fuel_purchase_id = fp.id AND ie.vehicle_unit IS NULL AND fp.vehicle_unit IS NOT NULL;

-- Filter indexes
CREATE INDEX IF NOT EXISTS idx_ifta_entries_vehicle ON public.ifta_entries(company_id, vehicle_unit);
CREATE INDEX IF NOT EXISTS idx_ifta_entries_driver  ON public.ifta_entries(company_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_expenses_driver      ON public.expenses(company_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_loads_vehicle        ON public.loads(company_id, vehicle_unit);
CREATE INDEX IF NOT EXISTS idx_loads_driver         ON public.loads(company_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_inspections_driver   ON public.inspections(company_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_documents_driver     ON public.documents(company_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_documents_category   ON public.documents(company_id, category);

-- Keep ifta_entries vehicle_unit + driver_id in sync from trip_logs
CREATE OR REPLACE FUNCTION public.sync_ifta_from_trip()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      (user_id, company_id, trip_log_id, load_id, entry_date, state_code, miles, fuel_gallons, vehicle_unit, driver_id)
    VALUES
      (NEW.user_id, NEW.company_id, NEW.id, NEW.load_id, effective_date, s_code, s_miles, s_gallons, NEW.vehicle_unit, NEW.user_id);
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Keep ifta_entries vehicle_unit + driver_id in sync from fuel purchases
CREATE OR REPLACE FUNCTION public.sync_from_fuel_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_notes text;
BEGIN
  v_notes := 'Auto-generated from fuel purchase' ||
             CASE WHEN NEW.station_name IS NOT NULL THEN ' at ' || NEW.station_name ELSE '' END;

  INSERT INTO public.ifta_entries
    (user_id, company_id, fuel_purchase_id, trip_log_id, load_id, entry_date, state_code, miles, fuel_gallons, fuel_cost_usd, notes, vehicle_unit, driver_id)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.trip_log_id, NEW.load_id, NEW.purchase_date, upper(NEW.state_code), 0, NEW.gallons, NEW.total_cost_usd, v_notes, NEW.vehicle_unit, COALESCE(NEW.driver_id, NEW.user_id))
  ON CONFLICT (fuel_purchase_id) WHERE fuel_purchase_id IS NOT NULL
  DO UPDATE SET
    entry_date    = EXCLUDED.entry_date,
    state_code    = EXCLUDED.state_code,
    fuel_gallons  = EXCLUDED.fuel_gallons,
    fuel_cost_usd = EXCLUDED.fuel_cost_usd,
    trip_log_id   = EXCLUDED.trip_log_id,
    load_id       = EXCLUDED.load_id,
    notes         = EXCLUDED.notes,
    user_id       = EXCLUDED.user_id,
    company_id    = EXCLUDED.company_id,
    vehicle_unit  = EXCLUDED.vehicle_unit,
    driver_id     = EXCLUDED.driver_id;

  INSERT INTO public.expenses
    (user_id, company_id, fuel_purchase_id, load_id, trip_log_id, expense_date, category, amount_usd, vendor, state_code, notes, receipt_url, vehicle_unit, driver_id)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.load_id, NEW.trip_log_id, NEW.purchase_date, 'Fuel', NEW.total_cost_usd, NEW.station_name, upper(NEW.state_code), v_notes, NEW.receipt_url, NEW.vehicle_unit, COALESCE(NEW.driver_id, NEW.user_id))
  ON CONFLICT (fuel_purchase_id) WHERE fuel_purchase_id IS NOT NULL
  DO UPDATE SET
    expense_date = EXCLUDED.expense_date,
    amount_usd   = EXCLUDED.amount_usd,
    vendor       = EXCLUDED.vendor,
    state_code   = EXCLUDED.state_code,
    load_id      = EXCLUDED.load_id,
    trip_log_id  = EXCLUDED.trip_log_id,
    receipt_url  = EXCLUDED.receipt_url,
    notes        = EXCLUDED.notes,
    user_id      = EXCLUDED.user_id,
    company_id   = EXCLUDED.company_id,
    vehicle_unit = EXCLUDED.vehicle_unit,
    driver_id    = EXCLUDED.driver_id;

  RETURN NEW;
END;
$function$;
