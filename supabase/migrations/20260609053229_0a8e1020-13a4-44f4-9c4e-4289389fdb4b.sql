
-- 1. Driver pay setup on profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS driver_pay_model text
    CHECK (driver_pay_model IN ('per_mile','percentage','flat')),
  ADD COLUMN IF NOT EXISTS driver_pay_rate numeric;

COMMENT ON COLUMN public.profiles.driver_pay_model IS
  'Auto-pay model used when generating settlements: per_mile = $/mi * miles, percentage = % of linehaul revenue, flat = flat $ per load.';
COMMENT ON COLUMN public.profiles.driver_pay_rate IS
  'Value paired with driver_pay_model. Interpreted as $/mile, percent (0-100), or flat $ depending on model.';

-- 2. Update settlement auto-create trigger to compute gross_pay_usd from driver pay setup
CREATE OR REPLACE FUNCTION public.sync_settlement_from_load()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_miles numeric;
  v_vehicle text;
  v_delivery_date date;
  v_customer text;
  v_origin text;
  v_destination text;
  v_pay_model text;
  v_pay_rate numeric;
  v_calc_pay numeric;
  v_rate_per_mile numeric;
BEGIN
  IF lower(COALESCE(NEW.status,'')) <> 'delivered' THEN
    RETURN NEW;
  END IF;

  SELECT distance_mi, vehicle_unit
    INTO v_miles, v_vehicle
    FROM public.trip_logs
    WHERE load_id = NEW.id
    ORDER BY completed_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

  -- Fall back to load's own miles when no trip log exists
  IF v_miles IS NULL OR v_miles = 0 THEN
    v_miles := COALESCE(NEW.total_miles, 0);
  END IF;

  v_delivery_date := COALESCE(NEW.delivery_at::date, CURRENT_DATE);
  v_customer      := COALESCE(NEW.consignee_name, NEW.shipper_name);
  v_origin        := NEW.shipper_address;
  v_destination   := NEW.consignee_address;

  -- Look up driver pay setup
  SELECT driver_pay_model, driver_pay_rate
    INTO v_pay_model, v_pay_rate
    FROM public.profiles
    WHERE id = NEW.user_id;

  IF v_pay_model IS NOT NULL AND v_pay_rate IS NOT NULL AND v_pay_rate > 0 THEN
    v_calc_pay := CASE v_pay_model
      WHEN 'per_mile'   THEN ROUND(v_pay_rate * COALESCE(v_miles, 0), 2)
      WHEN 'percentage' THEN ROUND((v_pay_rate / 100.0) * COALESCE(NEW.rate_usd, 0), 2)
      WHEN 'flat'       THEN ROUND(v_pay_rate, 2)
      ELSE NULL
    END;
  ELSE
    -- No pay setup: keep prior behavior (pay = load rate)
    v_calc_pay := COALESCE(NEW.rate_usd, 0);
  END IF;

  v_rate_per_mile := CASE
    WHEN COALESCE(v_miles, 0) > 0 THEN ROUND(COALESCE(v_calc_pay, 0) / v_miles, 4)
    ELSE NULL
  END;

  INSERT INTO public.settlements
    (user_id, company_id, load_id, driver_id, vehicle_unit, customer,
     origin, destination, delivery_date, settlement_date,
     gross_pay_usd, miles, rate_per_mile, linehaul_revenue_usd, status)
  VALUES
    (NEW.user_id, NEW.company_id, NEW.id, NEW.user_id, v_vehicle, v_customer,
     v_origin, v_destination, v_delivery_date, v_delivery_date,
     COALESCE(v_calc_pay, 0), COALESCE(v_miles, 0), v_rate_per_mile,
     COALESCE(NEW.rate_usd, 0), 'Draft')
  ON CONFLICT (load_id) WHERE load_id IS NOT NULL
  DO UPDATE SET
    driver_id            = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.driver_id ELSE settlements.driver_id END,
    vehicle_unit         = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.vehicle_unit ELSE settlements.vehicle_unit END,
    customer             = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.customer ELSE settlements.customer END,
    origin               = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.origin ELSE settlements.origin END,
    destination          = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.destination ELSE settlements.destination END,
    delivery_date        = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.delivery_date ELSE settlements.delivery_date END,
    miles                = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.miles ELSE settlements.miles END,
    rate_per_mile        = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.rate_per_mile ELSE settlements.rate_per_mile END,
    gross_pay_usd        = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.gross_pay_usd ELSE settlements.gross_pay_usd END,
    linehaul_revenue_usd = CASE WHEN settlements.status = 'Draft' THEN EXCLUDED.linehaul_revenue_usd ELSE settlements.linehaul_revenue_usd END;

  RETURN NEW;
END;
$function$;
