
-- 1) Miles per load (latest trip log distance per load)
CREATE OR REPLACE VIEW public.load_miles
WITH (security_invoker = true) AS
SELECT
  l.id           AS load_id,
  l.company_id,
  COALESCE(SUM(tl.distance_mi), 0)::numeric AS miles
FROM public.loads l
LEFT JOIN public.trip_logs tl ON tl.load_id = l.id
GROUP BY l.id, l.company_id;

-- 2) Per-load direct + allocated unassigned expenses
--    Unassigned = company expenses with NULL load_id, allocated by miles share.
CREATE OR REPLACE VIEW public.load_cost_allocation
WITH (security_invoker = true) AS
WITH direct AS (
  SELECT
    e.company_id,
    e.load_id,
    SUM(CASE WHEN e.category = 'Fuel'         THEN e.amount_usd ELSE 0 END) AS fuel_direct,
    SUM(CASE WHEN e.category = 'Maintenance'  THEN e.amount_usd ELSE 0 END) AS maintenance_direct,
    SUM(CASE WHEN e.category = 'Tolls'        THEN e.amount_usd ELSE 0 END) AS tolls_direct,
    SUM(CASE WHEN e.category = 'Scale Tickets'THEN e.amount_usd ELSE 0 END) AS scale_direct,
    SUM(CASE WHEN e.category NOT IN ('Fuel','Maintenance','Tolls','Scale Tickets')
             THEN e.amount_usd ELSE 0 END) AS other_direct
  FROM public.expenses e
  WHERE e.load_id IS NOT NULL
  GROUP BY e.company_id, e.load_id
),
unassigned AS (
  SELECT company_id, COALESCE(SUM(amount_usd),0) AS unassigned_total
  FROM public.expenses
  WHERE load_id IS NULL
  GROUP BY company_id
),
company_miles AS (
  SELECT company_id, NULLIF(SUM(miles),0) AS total_miles
  FROM public.load_miles
  GROUP BY company_id
)
SELECT
  lm.load_id,
  lm.company_id,
  lm.miles,
  COALESCE(d.fuel_direct, 0)        AS fuel_cost_usd,
  COALESCE(d.maintenance_direct, 0) AS maintenance_cost_usd,
  COALESCE(d.tolls_direct, 0)       AS tolls_usd,
  COALESCE(d.scale_direct, 0)       AS scale_tickets_usd,
  COALESCE(d.other_direct, 0)       AS other_expenses_usd,
  COALESCE(u.unassigned_total, 0) * (lm.miles / NULLIF(cm.total_miles, 0)) AS allocated_unassigned_usd
FROM public.load_miles lm
LEFT JOIN direct d        ON d.load_id = lm.load_id
LEFT JOIN unassigned u    ON u.company_id = lm.company_id
LEFT JOIN company_miles cm ON cm.company_id = lm.company_id;

-- 3) Per-load profitability
CREATE OR REPLACE VIEW public.load_profitability
WITH (security_invoker = true) AS
SELECT
  l.id                    AS load_id,
  l.company_id,
  l.user_id               AS driver_id,
  l.status,
  l.delivery_at,
  l.shipper_name,
  l.consignee_name,
  -- Revenue (from settlement; falls back to load rate)
  COALESCE(s.linehaul_revenue_usd, l.rate_usd, 0) AS linehaul_revenue_usd,
  COALESCE(s.fuel_surcharge_usd, 0)               AS fuel_surcharge_usd,
  COALESCE(s.detention_usd, 0)                    AS detention_usd,
  COALESCE(s.layover_usd, 0)                      AS layover_usd,
  COALESCE(s.lumper_reimbursement_usd, 0)         AS lumper_reimbursement_usd,
  COALESCE(s.other_revenue_usd, 0)                AS other_revenue_usd,
  COALESCE(s.gross_revenue_usd, l.rate_usd, 0)    AS gross_revenue_usd,
  -- Costs
  COALESCE(a.fuel_cost_usd, 0)        AS fuel_cost_usd,
  COALESCE(a.maintenance_cost_usd, 0) AS maintenance_cost_usd,
  COALESCE(a.tolls_usd, 0)            AS tolls_usd,
  COALESCE(a.scale_tickets_usd, 0)    AS scale_tickets_usd,
  COALESCE(s.total_deductions_usd, 0) AS driver_pay_usd,
  COALESCE(a.other_expenses_usd, 0)
    + COALESCE(a.allocated_unassigned_usd, 0)     AS other_expenses_usd,
  -- Totals
  (COALESCE(a.fuel_cost_usd,0) + COALESCE(a.maintenance_cost_usd,0)
   + COALESCE(a.tolls_usd,0)   + COALESCE(a.scale_tickets_usd,0)
   + COALESCE(s.total_deductions_usd,0)
   + COALESCE(a.other_expenses_usd,0) + COALESCE(a.allocated_unassigned_usd,0)) AS total_costs_usd,
  COALESCE(a.miles, 0) AS miles,
  -- Net + per-mile
  COALESCE(s.gross_revenue_usd, l.rate_usd, 0)
    - (COALESCE(a.fuel_cost_usd,0) + COALESCE(a.maintenance_cost_usd,0)
       + COALESCE(a.tolls_usd,0)   + COALESCE(a.scale_tickets_usd,0)
       + COALESCE(s.total_deductions_usd,0)
       + COALESCE(a.other_expenses_usd,0) + COALESCE(a.allocated_unassigned_usd,0)) AS net_profit_usd,
  CASE WHEN COALESCE(a.miles,0) > 0
       THEN COALESCE(s.gross_revenue_usd, l.rate_usd, 0) / a.miles END AS revenue_per_mile,
  CASE WHEN COALESCE(a.miles,0) > 0
       THEN (COALESCE(a.fuel_cost_usd,0) + COALESCE(a.maintenance_cost_usd,0)
             + COALESCE(a.tolls_usd,0)   + COALESCE(a.scale_tickets_usd,0)
             + COALESCE(s.total_deductions_usd,0)
             + COALESCE(a.other_expenses_usd,0) + COALESCE(a.allocated_unassigned_usd,0)) / a.miles
       END AS cost_per_mile,
  CASE WHEN COALESCE(a.miles,0) > 0
       THEN (COALESCE(s.gross_revenue_usd, l.rate_usd, 0)
             - (COALESCE(a.fuel_cost_usd,0) + COALESCE(a.maintenance_cost_usd,0)
                + COALESCE(a.tolls_usd,0)   + COALESCE(a.scale_tickets_usd,0)
                + COALESCE(s.total_deductions_usd,0)
                + COALESCE(a.other_expenses_usd,0) + COALESCE(a.allocated_unassigned_usd,0))) / a.miles
       END AS profit_per_mile
FROM public.loads l
LEFT JOIN public.settlements s        ON s.load_id = l.id
LEFT JOIN public.load_cost_allocation a ON a.load_id = l.id;

-- 4) Per-truck (per day; UI rolls up)
CREATE OR REPLACE VIEW public.truck_profitability
WITH (security_invoker = true) AS
WITH rev AS (
  SELECT company_id, vehicle_unit, COALESCE(delivery_date, settlement_date) AS d,
         SUM(COALESCE(gross_revenue_usd, gross_pay_usd, 0)) AS revenue,
         SUM(COALESCE(total_deductions_usd, deductions_usd, 0)) AS driver_pay,
         SUM(COALESCE(miles,0)) AS miles
  FROM public.settlements
  WHERE vehicle_unit IS NOT NULL
  GROUP BY company_id, vehicle_unit, COALESCE(delivery_date, settlement_date)
),
exp AS (
  SELECT company_id, vehicle_unit, expense_date AS d,
         SUM(CASE WHEN category='Fuel'        THEN amount_usd ELSE 0 END) AS fuel,
         SUM(CASE WHEN category='Maintenance' THEN amount_usd ELSE 0 END) AS maintenance,
         SUM(amount_usd) AS total_expenses
  FROM public.expenses
  WHERE vehicle_unit IS NOT NULL
  GROUP BY company_id, vehicle_unit, expense_date
),
trips AS (
  SELECT company_id, vehicle_unit,
         COALESCE(route_date, completed_at::date, created_at::date) AS d,
         SUM(COALESCE(distance_mi,0)) AS trip_miles
  FROM public.trip_logs
  WHERE vehicle_unit IS NOT NULL
  GROUP BY company_id, vehicle_unit, COALESCE(route_date, completed_at::date, created_at::date)
)
SELECT
  COALESCE(rev.company_id, exp.company_id, trips.company_id)     AS company_id,
  COALESCE(rev.vehicle_unit, exp.vehicle_unit, trips.vehicle_unit) AS vehicle_unit,
  COALESCE(rev.d, exp.d, trips.d)                                 AS day,
  COALESCE(rev.revenue, 0)        AS revenue_usd,
  COALESCE(exp.fuel, 0)           AS fuel_cost_usd,
  COALESCE(exp.maintenance, 0)    AS maintenance_cost_usd,
  COALESCE(exp.total_expenses, 0) AS total_expenses_usd,
  COALESCE(rev.driver_pay, 0)     AS driver_pay_usd,
  COALESCE(rev.revenue,0) - (COALESCE(exp.total_expenses,0) + COALESCE(rev.driver_pay,0)) AS net_profit_usd,
  COALESCE(trips.trip_miles, rev.miles, 0) AS miles,
  CASE WHEN COALESCE(trips.trip_miles, rev.miles, 0) > 0
       THEN COALESCE(rev.revenue,0) / COALESCE(trips.trip_miles, rev.miles) END AS revenue_per_mile,
  CASE WHEN COALESCE(trips.trip_miles, rev.miles, 0) > 0
       THEN (COALESCE(exp.total_expenses,0) + COALESCE(rev.driver_pay,0)) / COALESCE(trips.trip_miles, rev.miles) END AS cost_per_mile,
  CASE WHEN COALESCE(trips.trip_miles, rev.miles, 0) > 0
       THEN (COALESCE(rev.revenue,0) - (COALESCE(exp.total_expenses,0) + COALESCE(rev.driver_pay,0))) / COALESCE(trips.trip_miles, rev.miles) END AS profit_per_mile
FROM rev
FULL OUTER JOIN exp   ON exp.company_id   = rev.company_id   AND exp.vehicle_unit   = rev.vehicle_unit   AND exp.d   = rev.d
FULL OUTER JOIN trips ON trips.company_id = COALESCE(rev.company_id, exp.company_id)
                     AND trips.vehicle_unit = COALESCE(rev.vehicle_unit, exp.vehicle_unit)
                     AND trips.d = COALESCE(rev.d, exp.d);

-- 5) Per-driver profitability
CREATE OR REPLACE VIEW public.driver_profitability
WITH (security_invoker = true) AS
WITH s AS (
  SELECT company_id, driver_id,
         COUNT(*) FILTER (WHERE load_id IS NOT NULL) AS loads_completed,
         SUM(COALESCE(gross_revenue_usd, gross_pay_usd, 0)) AS revenue,
         SUM(COALESCE(miles,0)) AS miles
  FROM public.settlements
  WHERE driver_id IS NOT NULL
  GROUP BY company_id, driver_id
),
e AS (
  SELECT company_id, user_id AS driver_id,
         SUM(CASE WHEN category='Fuel' THEN amount_usd ELSE 0 END) AS fuel,
         SUM(amount_usd) AS total_expenses
  FROM public.expenses
  GROUP BY company_id, user_id
)
SELECT
  COALESCE(s.company_id, e.company_id) AS company_id,
  COALESCE(s.driver_id, e.driver_id)   AS driver_id,
  COALESCE(s.loads_completed, 0)       AS loads_completed,
  COALESCE(s.revenue, 0)               AS revenue_usd,
  COALESCE(e.fuel, 0)                  AS fuel_cost_usd,
  COALESCE(e.total_expenses, 0)        AS expenses_usd,
  COALESCE(s.revenue,0) - COALESCE(e.total_expenses,0) AS net_profit_usd,
  COALESCE(s.miles, 0)                 AS miles,
  CASE WHEN COALESCE(s.miles,0) > 0 THEN COALESCE(s.revenue,0) / s.miles END AS revenue_per_mile
FROM s
FULL OUTER JOIN e ON e.company_id = s.company_id AND e.driver_id = s.driver_id;

-- 6) Company profitability (per day)
CREATE OR REPLACE VIEW public.company_profitability
WITH (security_invoker = true) AS
WITH rev AS (
  SELECT company_id, COALESCE(delivery_date, settlement_date) AS d,
         SUM(COALESCE(gross_revenue_usd, gross_pay_usd, 0)) AS revenue,
         SUM(COALESCE(total_deductions_usd, deductions_usd, 0)) AS driver_pay,
         SUM(COALESCE(miles,0)) AS settlement_miles
  FROM public.settlements
  GROUP BY company_id, COALESCE(delivery_date, settlement_date)
),
ex AS (
  SELECT company_id, expense_date AS d,
         SUM(CASE WHEN category='Fuel'        THEN amount_usd ELSE 0 END) AS fuel,
         SUM(CASE WHEN category='Maintenance' THEN amount_usd ELSE 0 END) AS maintenance,
         SUM(amount_usd) AS total_expenses
  FROM public.expenses
  GROUP BY company_id, expense_date
),
tr AS (
  SELECT company_id, COALESCE(route_date, completed_at::date, created_at::date) AS d,
         SUM(COALESCE(distance_mi,0)) AS miles
  FROM public.trip_logs
  GROUP BY company_id, COALESCE(route_date, completed_at::date, created_at::date)
)
SELECT
  COALESCE(rev.company_id, ex.company_id, tr.company_id) AS company_id,
  COALESCE(rev.d, ex.d, tr.d)                            AS day,
  COALESCE(rev.revenue, 0)        AS gross_revenue_usd,
  COALESCE(ex.fuel, 0)            AS fuel_cost_usd,
  COALESCE(ex.maintenance, 0)     AS maintenance_cost_usd,
  COALESCE(rev.driver_pay, 0)     AS driver_pay_usd,
  COALESCE(ex.total_expenses, 0)  AS other_expenses_usd,
  COALESCE(ex.total_expenses, 0) + COALESCE(rev.driver_pay, 0) AS total_expenses_usd,
  COALESCE(rev.revenue,0) - (COALESCE(ex.total_expenses,0) + COALESCE(rev.driver_pay,0)) AS net_profit_usd,
  CASE WHEN COALESCE(rev.revenue,0) > 0
       THEN (COALESCE(rev.revenue,0) - (COALESCE(ex.total_expenses,0) + COALESCE(rev.driver_pay,0))) / rev.revenue
       END AS profit_margin,
  COALESCE(tr.miles, rev.settlement_miles, 0) AS miles,
  CASE WHEN COALESCE(tr.miles, rev.settlement_miles, 0) > 0
       THEN COALESCE(rev.revenue,0) / COALESCE(tr.miles, rev.settlement_miles) END AS revenue_per_mile,
  CASE WHEN COALESCE(tr.miles, rev.settlement_miles, 0) > 0
       THEN (COALESCE(ex.total_expenses,0) + COALESCE(rev.driver_pay,0)) / COALESCE(tr.miles, rev.settlement_miles) END AS cost_per_mile,
  CASE WHEN COALESCE(tr.miles, rev.settlement_miles, 0) > 0
       THEN (COALESCE(rev.revenue,0) - (COALESCE(ex.total_expenses,0) + COALESCE(rev.driver_pay,0))) / COALESCE(tr.miles, rev.settlement_miles) END AS profit_per_mile
FROM rev
FULL OUTER JOIN ex ON ex.company_id = rev.company_id AND ex.d = rev.d
FULL OUTER JOIN tr ON tr.company_id = COALESCE(rev.company_id, ex.company_id) AND tr.d = COALESCE(rev.d, ex.d);

-- 7) Truck lifetime costs
CREATE OR REPLACE VIEW public.truck_lifetime_costs
WITH (security_invoker = true) AS
SELECT
  company_id,
  vehicle_unit,
  SUM(CASE WHEN category='Fuel'        THEN amount_usd ELSE 0 END) AS fuel_total_usd,
  SUM(CASE WHEN category='Maintenance' THEN amount_usd ELSE 0 END) AS maintenance_total_usd,
  SUM(CASE WHEN category='Repairs'     THEN amount_usd ELSE 0 END) AS repairs_total_usd,
  SUM(CASE WHEN category='Tolls'       THEN amount_usd ELSE 0 END) AS tolls_total_usd,
  SUM(amount_usd) AS total_costs_usd
FROM public.expenses
WHERE vehicle_unit IS NOT NULL
GROUP BY company_id, vehicle_unit;

-- Grants (views inherit RLS via security_invoker)
GRANT SELECT ON public.load_miles            TO authenticated;
GRANT SELECT ON public.load_cost_allocation  TO authenticated;
GRANT SELECT ON public.load_profitability    TO authenticated;
GRANT SELECT ON public.truck_profitability   TO authenticated;
GRANT SELECT ON public.driver_profitability  TO authenticated;
GRANT SELECT ON public.company_profitability TO authenticated;
GRANT SELECT ON public.truck_lifetime_costs  TO authenticated;
