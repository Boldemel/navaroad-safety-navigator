
ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vehicle_unit text;

CREATE OR REPLACE FUNCTION public.sync_from_maintenance_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notes text;
BEGIN
  IF NEW.cost_usd IS NULL OR NEW.cost_usd <= 0 THEN
    DELETE FROM public.expenses WHERE maintenance_record_id = NEW.id;
    RETURN NEW;
  END IF;

  v_notes := COALESCE(
    NEW.notes,
    'Auto-generated from maintenance: ' || NEW.service_type
      || CASE WHEN NEW.vehicle_unit IS NOT NULL THEN ' (' || NEW.vehicle_unit || ')' ELSE '' END
  );

  INSERT INTO public.expenses
    (user_id, company_id, maintenance_record_id, expense_date, category,
     amount_usd, vendor, notes, vehicle_unit, receipt_url)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.service_date, 'Maintenance',
     NEW.cost_usd, NEW.vendor, v_notes, NEW.vehicle_unit, NEW.receipt_url)
  ON CONFLICT (maintenance_record_id) WHERE maintenance_record_id IS NOT NULL
  DO UPDATE SET
    expense_date  = EXCLUDED.expense_date,
    amount_usd    = EXCLUDED.amount_usd,
    vendor        = EXCLUDED.vendor,
    notes         = EXCLUDED.notes,
    vehicle_unit  = EXCLUDED.vehicle_unit,
    receipt_url   = EXCLUDED.receipt_url,
    user_id       = EXCLUDED.user_id,
    company_id    = EXCLUDED.company_id;

  RETURN NEW;
END;
$$;
