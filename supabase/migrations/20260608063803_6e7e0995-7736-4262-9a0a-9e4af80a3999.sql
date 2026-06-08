
-- Link columns
ALTER TABLE public.ifta_entries
  ADD COLUMN IF NOT EXISTS fuel_purchase_id uuid REFERENCES public.fuel_purchases(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS ifta_entries_fuel_purchase_uidx
  ON public.ifta_entries(fuel_purchase_id) WHERE fuel_purchase_id IS NOT NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS fuel_purchase_id uuid REFERENCES public.fuel_purchases(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_fuel_purchase_uidx
  ON public.expenses(fuel_purchase_id) WHERE fuel_purchase_id IS NOT NULL;

-- Trigger function: sync IFTA + Expense rows from a fuel purchase
CREATE OR REPLACE FUNCTION public.sync_from_fuel_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notes text;
BEGIN
  v_notes := 'Auto-generated from fuel purchase' ||
             CASE WHEN NEW.station_name IS NOT NULL THEN ' at ' || NEW.station_name ELSE '' END;

  -- IFTA fuel row (miles=0; mileage comes from trip_logs)
  INSERT INTO public.ifta_entries
    (user_id, company_id, fuel_purchase_id, entry_date, state_code, miles, fuel_gallons, fuel_cost_usd, notes)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.purchase_date, upper(NEW.state_code), 0, NEW.gallons, NEW.total_cost_usd, v_notes)
  ON CONFLICT (fuel_purchase_id) WHERE fuel_purchase_id IS NOT NULL
  DO UPDATE SET
    entry_date    = EXCLUDED.entry_date,
    state_code    = EXCLUDED.state_code,
    fuel_gallons  = EXCLUDED.fuel_gallons,
    fuel_cost_usd = EXCLUDED.fuel_cost_usd,
    notes         = EXCLUDED.notes,
    user_id       = EXCLUDED.user_id,
    company_id    = EXCLUDED.company_id;

  -- Expense row (Fuel category)
  INSERT INTO public.expenses
    (user_id, company_id, fuel_purchase_id, expense_date, category, amount_usd, vendor, state_code, notes)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.purchase_date, 'Fuel', NEW.total_cost_usd, NEW.station_name, upper(NEW.state_code), v_notes)
  ON CONFLICT (fuel_purchase_id) WHERE fuel_purchase_id IS NOT NULL
  DO UPDATE SET
    expense_date = EXCLUDED.expense_date,
    amount_usd   = EXCLUDED.amount_usd,
    vendor       = EXCLUDED.vendor,
    state_code   = EXCLUDED.state_code,
    notes        = EXCLUDED.notes,
    user_id      = EXCLUDED.user_id,
    company_id   = EXCLUDED.company_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fuel_purchases_sync_downstream ON public.fuel_purchases;
CREATE TRIGGER fuel_purchases_sync_downstream
AFTER INSERT OR UPDATE ON public.fuel_purchases
FOR EACH ROW EXECUTE FUNCTION public.sync_from_fuel_purchase();

-- Backfill for any existing fuel purchases
INSERT INTO public.ifta_entries
  (user_id, company_id, fuel_purchase_id, entry_date, state_code, miles, fuel_gallons, fuel_cost_usd, notes)
SELECT fp.user_id, fp.company_id, fp.id, fp.purchase_date, upper(fp.state_code), 0, fp.gallons, fp.total_cost_usd,
       'Auto-generated from fuel purchase' || CASE WHEN fp.station_name IS NOT NULL THEN ' at ' || fp.station_name ELSE '' END
FROM public.fuel_purchases fp
WHERE NOT EXISTS (SELECT 1 FROM public.ifta_entries i WHERE i.fuel_purchase_id = fp.id);

INSERT INTO public.expenses
  (user_id, company_id, fuel_purchase_id, expense_date, category, amount_usd, vendor, state_code, notes)
SELECT fp.user_id, fp.company_id, fp.id, fp.purchase_date, 'Fuel', fp.total_cost_usd, fp.station_name, upper(fp.state_code),
       'Auto-generated from fuel purchase' || CASE WHEN fp.station_name IS NOT NULL THEN ' at ' || fp.station_name ELSE '' END
FROM public.fuel_purchases fp
WHERE NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.fuel_purchase_id = fp.id);
