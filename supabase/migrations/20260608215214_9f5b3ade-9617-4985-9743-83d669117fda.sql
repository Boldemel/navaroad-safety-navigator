
-- 1) Extend settlements
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_unit text,
  ADD COLUMN IF NOT EXISTS customer text,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Draft',
  -- revenue
  ADD COLUMN IF NOT EXISTS linehaul_revenue_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuel_surcharge_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detention_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS layover_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lumper_reimbursement_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_revenue_usd numeric(12,2) NOT NULL DEFAULT 0,
  -- deductions
  ADD COLUMN IF NOT EXISTS fuel_advances_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tolls_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scale_tickets_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repairs_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_advances_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions_usd numeric(12,2) NOT NULL DEFAULT 0;

-- Computed totals (generated columns)
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS gross_revenue_usd numeric(12,2) GENERATED ALWAYS AS (
    linehaul_revenue_usd + fuel_surcharge_usd + detention_usd
    + layover_usd + lumper_reimbursement_usd + other_revenue_usd
  ) STORED;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS total_deductions_usd numeric(12,2) GENERATED ALWAYS AS (
    fuel_advances_usd + tolls_usd + scale_tickets_usd
    + repairs_usd + cash_advances_usd + other_deductions_usd
  ) STORED;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS net_settlement_usd numeric(12,2) GENERATED ALWAYS AS (
    (linehaul_revenue_usd + fuel_surcharge_usd + detention_usd
     + layover_usd + lumper_reimbursement_usd + other_revenue_usd)
    -
    (fuel_advances_usd + tolls_usd + scale_tickets_usd
     + repairs_usd + cash_advances_usd + other_deductions_usd)
  ) STORED;

-- Dedup: one settlement per load
CREATE UNIQUE INDEX IF NOT EXISTS settlements_load_id_key
  ON public.settlements(load_id) WHERE load_id IS NOT NULL;

-- 2) Trigger: load delivered → draft settlement
CREATE OR REPLACE FUNCTION public.sync_settlement_from_load()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_miles numeric;
  v_vehicle text;
  v_delivery_date date;
  v_customer text;
  v_origin text;
  v_destination text;
BEGIN
  IF lower(COALESCE(NEW.status,'')) <> 'delivered' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(OLD.status,'')) = 'delivered' THEN
    -- already delivered; refresh draft only
    NULL;
  END IF;

  SELECT distance_mi, vehicle_unit
    INTO v_miles, v_vehicle
    FROM public.trip_logs
    WHERE load_id = NEW.id
    ORDER BY completed_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

  v_delivery_date := COALESCE(NEW.delivery_at::date, CURRENT_DATE);
  v_customer      := COALESCE(NEW.consignee_name, NEW.shipper_name);
  v_origin        := NEW.shipper_address;
  v_destination   := NEW.consignee_address;

  INSERT INTO public.settlements
    (user_id, company_id, load_id, driver_id, vehicle_unit, customer,
     origin, destination, delivery_date, settlement_date,
     gross_pay_usd, miles, linehaul_revenue_usd, status)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.user_id, v_vehicle, v_customer,
     v_origin, v_destination, v_delivery_date, v_delivery_date,
     COALESCE(NEW.rate_usd, 0), COALESCE(v_miles, 0), COALESCE(NEW.rate_usd, 0), 'Draft')
  ON CONFLICT (load_id) WHERE load_id IS NOT NULL
  DO UPDATE SET
    -- only refresh draft-stage settlements with load identity changes
    driver_id       = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.driver_id ELSE settlements.driver_id END,
    vehicle_unit    = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.vehicle_unit ELSE settlements.vehicle_unit END,
    customer        = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.customer ELSE settlements.customer END,
    origin          = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.origin ELSE settlements.origin END,
    destination     = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.destination ELSE settlements.destination END,
    delivery_date   = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.delivery_date ELSE settlements.delivery_date END,
    miles           = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.miles ELSE settlements.miles END,
    gross_pay_usd   = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.gross_pay_usd ELSE settlements.gross_pay_usd END,
    linehaul_revenue_usd = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.linehaul_revenue_usd ELSE settlements.linehaul_revenue_usd END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_settlement_from_load ON public.loads;
CREATE TRIGGER trg_sync_settlement_from_load
AFTER INSERT OR UPDATE OF status, rate_usd, delivery_at, shipper_name, shipper_address, consignee_name, consignee_address
ON public.loads
FOR EACH ROW EXECUTE FUNCTION public.sync_settlement_from_load();
