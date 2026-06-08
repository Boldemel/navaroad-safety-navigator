
-- Link expenses to maintenance records and auto-sync
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS maintenance_record_id uuid REFERENCES public.maintenance_records(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_maintenance_record_id_key
  ON public.expenses(maintenance_record_id) WHERE maintenance_record_id IS NOT NULL;

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

  v_notes := 'Auto-generated from maintenance: ' || NEW.service_type
             || CASE WHEN NEW.vehicle_unit IS NOT NULL THEN ' (' || NEW.vehicle_unit || ')' ELSE '' END;

  INSERT INTO public.expenses
    (user_id, company_id, maintenance_record_id, expense_date, category, amount_usd, vendor, notes)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.service_date, 'Maintenance', NEW.cost_usd, NEW.vendor, COALESCE(NEW.notes, v_notes))
  ON CONFLICT (maintenance_record_id) WHERE maintenance_record_id IS NOT NULL
  DO UPDATE SET
    expense_date = EXCLUDED.expense_date,
    amount_usd   = EXCLUDED.amount_usd,
    vendor       = EXCLUDED.vendor,
    notes        = EXCLUDED.notes,
    user_id      = EXCLUDED.user_id,
    company_id   = EXCLUDED.company_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_from_maintenance_record ON public.maintenance_records;
CREATE TRIGGER trg_sync_from_maintenance_record
AFTER INSERT OR UPDATE ON public.maintenance_records
FOR EACH ROW EXECUTE FUNCTION public.sync_from_maintenance_record();
