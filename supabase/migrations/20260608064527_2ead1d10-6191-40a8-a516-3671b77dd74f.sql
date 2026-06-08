
-- Extend fuel_purchases with driver/load/trip/receipt linkage
ALTER TABLE public.fuel_purchases
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trip_log_id uuid REFERENCES public.trip_logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_url text;

CREATE INDEX IF NOT EXISTS fuel_purchases_load_id_idx ON public.fuel_purchases(load_id);
CREATE INDEX IF NOT EXISTS fuel_purchases_trip_log_id_idx ON public.fuel_purchases(trip_log_id);
CREATE INDEX IF NOT EXISTS fuel_purchases_driver_id_idx ON public.fuel_purchases(driver_id);

-- Extend expenses with load/trip linkage (receipt_url already exists)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trip_log_id uuid REFERENCES public.trip_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_load_id_idx ON public.expenses(load_id);
CREATE INDEX IF NOT EXISTS expenses_trip_log_id_idx ON public.expenses(trip_log_id);

-- Update sync trigger to propagate load_id, trip_log_id, and receipt_url
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

  -- IFTA fuel row (miles=0; mileage comes from trip_logs)
  INSERT INTO public.ifta_entries
    (user_id, company_id, fuel_purchase_id, trip_log_id, load_id, entry_date, state_code, miles, fuel_gallons, fuel_cost_usd, notes)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.trip_log_id, NEW.load_id, NEW.purchase_date, upper(NEW.state_code), 0, NEW.gallons, NEW.total_cost_usd, v_notes)
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
    company_id    = EXCLUDED.company_id;

  -- Expense row (Fuel category)
  INSERT INTO public.expenses
    (user_id, company_id, fuel_purchase_id, load_id, trip_log_id, expense_date, category, amount_usd, vendor, state_code, notes, receipt_url)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.load_id, NEW.trip_log_id, NEW.purchase_date, 'Fuel', NEW.total_cost_usd, NEW.station_name, upper(NEW.state_code), v_notes, NEW.receipt_url)
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
    company_id   = EXCLUDED.company_id;

  RETURN NEW;
END;
$function$;

-- Ensure trigger is attached (idempotent)
DROP TRIGGER IF EXISTS fuel_purchases_sync_after_change ON public.fuel_purchases;
CREATE TRIGGER fuel_purchases_sync_after_change
AFTER INSERT OR UPDATE ON public.fuel_purchases
FOR EACH ROW EXECUTE FUNCTION public.sync_from_fuel_purchase();
