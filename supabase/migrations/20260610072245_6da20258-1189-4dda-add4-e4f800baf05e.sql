
CREATE OR REPLACE VIEW public.truck_profitability_view
WITH (security_invoker = true) AS
WITH rev AS (
  SELECT company_id, vehicle_unit,
    COALESCE(SUM(COALESCE(gross_revenue_usd, linehaul_revenue_usd, 0)),0)::numeric AS revenue_usd,
    COALESCE(SUM(miles), 0)::numeric AS settled_miles,
    COUNT(*)::int AS settlement_count
  FROM public.settlements WHERE vehicle_unit IS NOT NULL
  GROUP BY company_id, vehicle_unit
),
fuel AS (
  SELECT company_id, vehicle_unit,
    COALESCE(SUM(total_cost_usd),0)::numeric AS fuel_cost_usd,
    COALESCE(SUM(gallons),0)::numeric AS gallons
  FROM public.fuel_purchases WHERE vehicle_unit IS NOT NULL
  GROUP BY company_id, vehicle_unit
),
maint AS (
  SELECT company_id, vehicle_unit, COALESCE(SUM(cost_usd),0)::numeric AS maintenance_cost_usd
  FROM public.maintenance_records WHERE vehicle_unit IS NOT NULL
  GROUP BY company_id, vehicle_unit
),
exp AS (
  SELECT company_id, vehicle_unit, COALESCE(SUM(amount_usd),0)::numeric AS other_expense_usd
  FROM public.expenses
  WHERE vehicle_unit IS NOT NULL AND category NOT IN ('Fuel','Maintenance')
  GROUP BY company_id, vehicle_unit
),
trips AS (
  SELECT company_id, vehicle_unit, COALESCE(SUM(distance_mi),0)::numeric AS driven_miles
  FROM public.trip_logs WHERE vehicle_unit IS NOT NULL
  GROUP BY company_id, vehicle_unit
)
SELECT
  COALESCE(rev.company_id, fuel.company_id, maint.company_id, exp.company_id, trips.company_id) AS company_id,
  COALESCE(rev.vehicle_unit, fuel.vehicle_unit, maint.vehicle_unit, exp.vehicle_unit, trips.vehicle_unit) AS vehicle_unit,
  COALESCE(rev.revenue_usd,0) AS revenue_usd,
  COALESCE(fuel.fuel_cost_usd,0) AS fuel_cost_usd,
  COALESCE(maint.maintenance_cost_usd,0) AS maintenance_cost_usd,
  COALESCE(exp.other_expense_usd,0) AS other_expense_usd,
  (COALESCE(fuel.fuel_cost_usd,0)+COALESCE(maint.maintenance_cost_usd,0)+COALESCE(exp.other_expense_usd,0)) AS total_cost_usd,
  (COALESCE(rev.revenue_usd,0)-(COALESCE(fuel.fuel_cost_usd,0)+COALESCE(maint.maintenance_cost_usd,0)+COALESCE(exp.other_expense_usd,0))) AS net_profit_usd,
  COALESCE(rev.settled_miles,0) AS settled_miles,
  COALESCE(trips.driven_miles,0) AS driven_miles,
  COALESCE(fuel.gallons,0) AS gallons,
  CASE WHEN COALESCE(fuel.gallons,0) > 0 THEN COALESCE(trips.driven_miles, rev.settled_miles, 0) / fuel.gallons ELSE NULL END AS mpg,
  COALESCE(rev.settlement_count,0) AS settlement_count
FROM rev
FULL JOIN fuel  USING (company_id, vehicle_unit)
FULL JOIN maint USING (company_id, vehicle_unit)
FULL JOIN exp   USING (company_id, vehicle_unit)
FULL JOIN trips USING (company_id, vehicle_unit);

CREATE OR REPLACE VIEW public.driver_performance_view
WITH (security_invoker = true) AS
WITH rev AS (
  SELECT company_id, driver_id,
    COALESCE(SUM(COALESCE(gross_revenue_usd, linehaul_revenue_usd, 0)),0)::numeric AS revenue_usd,
    COALESCE(SUM(net_settlement_usd),0)::numeric AS driver_net_pay_usd,
    COALESCE(SUM(miles),0)::numeric AS settled_miles,
    COUNT(*)::int AS settlement_count
  FROM public.settlements WHERE driver_id IS NOT NULL
  GROUP BY company_id, driver_id
),
loads_c AS (
  SELECT company_id, driver_id, COUNT(*) FILTER (WHERE lower(status)='delivered')::int AS loads_delivered
  FROM public.loads WHERE driver_id IS NOT NULL
  GROUP BY company_id, driver_id
),
trips AS (
  SELECT company_id, user_id AS driver_id,
    COALESCE(SUM(distance_mi),0)::numeric AS driven_miles,
    COALESCE(AVG(safety_score),0)::numeric AS avg_safety_score,
    COALESCE(SUM(hazard_count),0)::int AS hazard_count,
    COUNT(*)::int AS trip_count
  FROM public.trip_logs
  GROUP BY company_id, user_id
),
insp AS (
  SELECT company_id, driver_id,
    COUNT(*)::int AS inspection_count,
    COUNT(*) FILTER (WHERE defects_correction_required)::int AS inspections_with_defects
  FROM public.inspections WHERE driver_id IS NOT NULL
  GROUP BY company_id, driver_id
),
hos AS (
  SELECT company_id, user_id AS driver_id,
    COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) / 3600.0),0)::numeric AS total_on_duty_hours
  FROM public.duty_status_logs WHERE status IN ('Driving','OnDuty','on_duty','driving')
  GROUP BY company_id, user_id
),
fuel AS (
  SELECT company_id, driver_id,
    COALESCE(SUM(gallons),0)::numeric AS gallons,
    COALESCE(SUM(total_cost_usd),0)::numeric AS fuel_cost_usd
  FROM public.fuel_purchases WHERE driver_id IS NOT NULL
  GROUP BY company_id, driver_id
)
SELECT
  COALESCE(rev.company_id, loads_c.company_id, trips.company_id, insp.company_id, hos.company_id, fuel.company_id) AS company_id,
  COALESCE(rev.driver_id, loads_c.driver_id, trips.driver_id, insp.driver_id, hos.driver_id, fuel.driver_id) AS driver_id,
  COALESCE(rev.revenue_usd,0) AS revenue_usd,
  COALESCE(rev.driver_net_pay_usd,0) AS driver_net_pay_usd,
  COALESCE(rev.settled_miles,0) AS settled_miles,
  COALESCE(trips.driven_miles,0) AS driven_miles,
  COALESCE(rev.settlement_count,0) AS settlement_count,
  COALESCE(loads_c.loads_delivered,0) AS loads_delivered,
  COALESCE(trips.trip_count,0) AS trip_count,
  COALESCE(trips.avg_safety_score,0) AS avg_safety_score,
  COALESCE(trips.hazard_count,0) AS hazard_count,
  COALESCE(insp.inspection_count,0) AS inspection_count,
  COALESCE(insp.inspections_with_defects,0) AS inspections_with_defects,
  COALESCE(hos.total_on_duty_hours,0) AS total_on_duty_hours,
  COALESCE(fuel.gallons,0) AS gallons,
  COALESCE(fuel.fuel_cost_usd,0) AS fuel_cost_usd,
  CASE WHEN COALESCE(fuel.gallons,0)>0 THEN COALESCE(trips.driven_miles, rev.settled_miles, 0) / fuel.gallons ELSE NULL END AS mpg,
  CASE WHEN COALESCE(rev.settled_miles,0)>0 THEN COALESCE(rev.revenue_usd,0) / rev.settled_miles ELSE NULL END AS revenue_per_mile
FROM rev
FULL JOIN loads_c USING (company_id, driver_id)
FULL JOIN trips   USING (company_id, driver_id)
FULL JOIN insp    USING (company_id, driver_id)
FULL JOIN hos     USING (company_id, driver_id)
FULL JOIN fuel    USING (company_id, driver_id);

CREATE OR REPLACE VIEW public.load_profitability_view
WITH (security_invoker = true) AS
SELECT
  l.id AS load_id, l.company_id, l.user_id, l.driver_id, l.vehicle_unit, l.status,
  l.bol_number, l.shipper_name, l.consignee_name, l.pickup_at, l.delivery_at, l.rate_usd,
  COALESCE(l.total_miles,
    (SELECT SUM(tl.distance_mi) FROM public.trip_logs tl WHERE tl.load_id = l.id), 0)::numeric AS total_miles,
  COALESCE((SELECT SUM(total_cost_usd) FROM public.fuel_purchases WHERE load_id = l.id),0)::numeric AS fuel_cost_usd,
  COALESCE((SELECT SUM(amount_usd) FROM public.expenses WHERE load_id = l.id AND category NOT IN ('Fuel')),0)::numeric AS other_expense_usd,
  COALESCE((SELECT gross_pay_usd FROM public.settlements WHERE load_id = l.id LIMIT 1),0)::numeric AS driver_pay_usd,
  (COALESCE(l.rate_usd,0)
    - COALESCE((SELECT SUM(total_cost_usd) FROM public.fuel_purchases WHERE load_id = l.id),0)
    - COALESCE((SELECT SUM(amount_usd) FROM public.expenses WHERE load_id = l.id AND category NOT IN ('Fuel')),0)
    - COALESCE((SELECT gross_pay_usd FROM public.settlements WHERE load_id = l.id LIMIT 1),0)
  ) AS net_profit_usd,
  CASE WHEN COALESCE(l.total_miles,0)>0 THEN COALESCE(l.rate_usd,0)/l.total_miles ELSE NULL END AS revenue_per_mile
FROM public.loads l;

CREATE OR REPLACE VIEW public.fleet_profitability_view
WITH (security_invoker = true) AS
WITH rev AS (
  SELECT company_id,
    COALESCE(SUM(COALESCE(gross_revenue_usd, linehaul_revenue_usd, 0)),0)::numeric AS revenue_usd,
    COALESCE(SUM(miles),0)::numeric AS settled_miles,
    COUNT(*)::int AS settlement_count
  FROM public.settlements GROUP BY company_id
),
fuel AS (
  SELECT company_id,
    COALESCE(SUM(total_cost_usd),0)::numeric AS fuel_cost_usd,
    COALESCE(SUM(gallons),0)::numeric AS gallons
  FROM public.fuel_purchases GROUP BY company_id
),
maint AS (
  SELECT company_id, COALESCE(SUM(cost_usd),0)::numeric AS maintenance_cost_usd
  FROM public.maintenance_records GROUP BY company_id
),
exp AS (
  SELECT company_id, COALESCE(SUM(amount_usd),0)::numeric AS other_expense_usd
  FROM public.expenses WHERE category NOT IN ('Fuel','Maintenance') GROUP BY company_id
),
trips AS (
  SELECT company_id, COALESCE(SUM(distance_mi),0)::numeric AS driven_miles
  FROM public.trip_logs GROUP BY company_id
),
trucks AS (
  SELECT company_id, COUNT(DISTINCT vehicle_unit)::int AS truck_count
  FROM public.truck_profitability_view GROUP BY company_id
),
drivers AS (
  SELECT company_id, COUNT(DISTINCT user_id)::int AS driver_count
  FROM public.company_members GROUP BY company_id
)
SELECT
  c.id AS company_id, c.name AS company_name,
  COALESCE(rev.revenue_usd,0) AS revenue_usd,
  COALESCE(fuel.fuel_cost_usd,0) AS fuel_cost_usd,
  COALESCE(maint.maintenance_cost_usd,0) AS maintenance_cost_usd,
  COALESCE(exp.other_expense_usd,0) AS other_expense_usd,
  (COALESCE(fuel.fuel_cost_usd,0)+COALESCE(maint.maintenance_cost_usd,0)+COALESCE(exp.other_expense_usd,0)) AS total_cost_usd,
  (COALESCE(rev.revenue_usd,0)-(COALESCE(fuel.fuel_cost_usd,0)+COALESCE(maint.maintenance_cost_usd,0)+COALESCE(exp.other_expense_usd,0))) AS net_profit_usd,
  COALESCE(rev.settled_miles,0) AS settled_miles,
  COALESCE(trips.driven_miles,0) AS driven_miles,
  COALESCE(fuel.gallons,0) AS gallons,
  CASE WHEN COALESCE(fuel.gallons,0)>0 THEN COALESCE(trips.driven_miles, rev.settled_miles, 0)/fuel.gallons ELSE NULL END AS mpg,
  COALESCE(trucks.truck_count,0) AS truck_count,
  COALESCE(drivers.driver_count,0) AS driver_count,
  COALESCE(rev.settlement_count,0) AS settlement_count
FROM public.companies c
LEFT JOIN rev ON rev.company_id=c.id
LEFT JOIN fuel ON fuel.company_id=c.id
LEFT JOIN maint ON maint.company_id=c.id
LEFT JOIN exp ON exp.company_id=c.id
LEFT JOIN trips ON trips.company_id=c.id
LEFT JOIN trucks ON trucks.company_id=c.id
LEFT JOIN drivers ON drivers.company_id=c.id;

GRANT SELECT ON public.truck_profitability_view  TO authenticated;
GRANT SELECT ON public.driver_performance_view   TO authenticated;
GRANT SELECT ON public.load_profitability_view   TO authenticated;
GRANT SELECT ON public.fleet_profitability_view  TO authenticated;
GRANT ALL    ON public.truck_profitability_view  TO service_role;
GRANT ALL    ON public.driver_performance_view   TO service_role;
GRANT ALL    ON public.load_profitability_view   TO service_role;
GRANT ALL    ON public.fleet_profitability_view  TO service_role;
