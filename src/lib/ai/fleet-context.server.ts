import type { SupabaseClient } from "@supabase/supabase-js";

export type ContextScope = {
  companyId: string;
  userId: string;
  isDriver: boolean;
  isOwner: boolean;
  roles: string[];
};

/**
 * Loads a compact, permission-scoped snapshot for the AI copilot.
 * When the caller is a driver-only user, filters most datasets to their own
 * user_id / driver_id. Fleet owners and managers see the full company view.
 */
export async function buildFleetContext(
  supabase: SupabaseClient,
  scope: ContextScope,
): Promise<string> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sinceDate = since.slice(0, 10);
  const driverOnly = scope.isDriver && !scope.isOwner && !scope.roles.some((r) =>
    ["fleet_owner", "fleet_manager", "dispatcher", "safety_manager", "maintenance_manager", "accountant"].includes(r),
  );

  // Helper to optionally scope a query by user_id / driver_id when driverOnly
  const scoped = <T extends { eq: (col: string, v: any) => T }>(q: T, col = "user_id"): T =>
    driverOnly ? q.eq(col, scope.userId) : q;

  const [
    companyR, loadsR, fuelR, expR, settR, maintR, tripsR, hosR, iftaR,
    inspR, docsR, hazardsR, planR, membersR,
  ] = await Promise.all([
    supabase.from("companies").select("id,name,subscription_status,subscription_plan_id,trial_ends_at,current_period_end").eq("id", scope.companyId).maybeSingle(),
    scoped(supabase.from("loads").select("id,user_id,driver_id,status,rate_usd,pickup_at,delivery_at,shipper_address,consignee_address,weight_lbs,commodity,vehicle_unit").gte("created_at", since).limit(300), "driver_id"),
    scoped(supabase.from("fuel_purchases").select("user_id,purchase_date,gallons,price_per_gallon,total_cost_usd,state_code,vehicle_unit").gte("purchase_date", sinceDate).limit(300)),
    scoped(supabase.from("expenses").select("user_id,expense_date,category,amount_usd,vendor,state_code,vehicle_unit").gte("expense_date", sinceDate).limit(300)),
    scoped(supabase.from("settlements").select("user_id,driver_id,load_id,settlement_date,gross_pay_usd,miles,rate_per_mile,deductions_usd").gte("settlement_date", sinceDate).limit(300), "driver_id"),
    scoped(supabase.from("maintenance_records").select("user_id,vehicle_unit,service_date,service_type,cost_usd,odometer,vendor").gte("service_date", sinceDate).limit(200)),
    scoped(supabase.from("trip_logs").select("user_id,origin,destination,distance_mi,duration_min,fuel_cost,completed_at,safety_score,hazard_count").gte("completed_at", since).limit(200)),
    scoped(supabase.from("duty_status_logs").select("user_id,status,start_time,end_time,duration_minutes,vehicle_unit").gte("start_time", since).limit(300)),
    scoped(supabase.from("ifta_entries").select("user_id,quarter,year,state_code,miles,gallons,vehicle_unit").limit(200)),
    scoped(supabase.from("inspections").select("user_id,driver_id,vehicle_unit,inspection_date,inspection_type,result,defects_count").gte("inspection_date", sinceDate).limit(200), "driver_id"),
    scoped(supabase.from("documents").select("user_id,name,category,expires_at,uploaded_at").limit(200)),
    supabase.from("hazard_reports").select("id,hazard_type,severity,latitude,longitude,description,created_at,active").gte("created_at", since).eq("active", true).limit(150),
    supabase.from("subscription_plans").select("id,name,price_monthly_usd,max_trucks,max_drivers,features").limit(20),
    supabase.from("company_members").select("id,user_id").limit(200),
  ]);

  const round = (n: number) => Math.round(n * 100) / 100;

  const company = companyR.data ?? null;
  const plan = company?.subscription_plan_id
    ? (planR.data ?? []).find((p: any) => p.id === company.subscription_plan_id) ?? null
    : null;

  const loads = loadsR.data ?? [];
  const fuel = fuelR.data ?? [];
  const expenses = expR.data ?? [];
  const settlements = settR.data ?? [];
  const maint = maintR.data ?? [];
  const trips = tripsR.data ?? [];
  const hos = hosR.data ?? [];
  const ifta = iftaR.data ?? [];
  const inspections = inspR.data ?? [];
  const docs = docsR.data ?? [];
  const hazards = hazardsR.data ?? [];

  // Expiring / expired documents in next 60 days
  const now = Date.now();
  const soon = now + 60 * 24 * 60 * 60 * 1000;
  const expiringDocs = docs
    .filter((d: any) => d.expires_at && new Date(d.expires_at).getTime() < soon)
    .map((d: any) => ({ name: d.name, category: d.category, expires_at: d.expires_at }))
    .slice(0, 30);

  // Per-truck aggregates
  type TruckAgg = { unit: string; fuel_cost: number; gallons: number; maint_cost: number; services: number };
  const trucks = new Map<string, TruckAgg>();
  const t = (u: string | null | undefined) => {
    const k = (u ?? "unassigned").toString();
    if (!trucks.has(k)) trucks.set(k, { unit: k, fuel_cost: 0, gallons: 0, maint_cost: 0, services: 0 });
    return trucks.get(k)!;
  };
  for (const f of fuel) { const a = t(f.vehicle_unit); a.fuel_cost += Number(f.total_cost_usd) || 0; a.gallons += Number(f.gallons) || 0; }
  for (const m of maint) { const a = t(m.vehicle_unit); a.maint_cost += Number(m.cost_usd) || 0; a.services += 1; }

  // Per-driver aggregates
  type DrvAgg = { user_id: string; revenue: number; settled_pay: number; expenses: number; fuel_cost: number; loads_completed: number; miles_settled: number };
  const drivers = new Map<string, DrvAgg>();
  const d = (u: string) => {
    if (!drivers.has(u)) drivers.set(u, { user_id: u, revenue: 0, settled_pay: 0, expenses: 0, fuel_cost: 0, loads_completed: 0, miles_settled: 0 });
    return drivers.get(u)!;
  };
  for (const l of loads) if (l.status === "delivered" || l.status === "completed") { const a = d(l.driver_id || l.user_id); a.revenue += Number(l.rate_usd) || 0; a.loads_completed += 1; }
  for (const s of settlements) { const a = d(s.driver_id || s.user_id); a.settled_pay += Number(s.gross_pay_usd) || 0; a.miles_settled += Number(s.miles) || 0; }
  for (const e of expenses) d(e.user_id).expenses += Number(e.amount_usd) || 0;
  for (const f of fuel) d(f.user_id).fuel_cost += Number(f.total_cost_usd) || 0;

  // HOS totals per driver (last 8 days)
  const hos8Since = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const hosByDriver: Record<string, number> = {};
  for (const h of hos) {
    if (new Date(h.start_time).getTime() < hos8Since) continue;
    if (h.status === "driving" || h.status === "on_duty") {
      hosByDriver[h.user_id] = (hosByDriver[h.user_id] || 0) + (Number(h.duration_minutes) || 0);
    }
  }

  const totals = {
    loads_count: loads.length,
    loads_active: loads.filter((l: any) => !["delivered", "completed", "cancelled"].includes(l.status)).length,
    loads_delivered: loads.filter((l: any) => l.status === "delivered" || l.status === "completed").length,
    revenue: loads.reduce((s, l: any) => s + ((l.status === "delivered" || l.status === "completed") ? (Number(l.rate_usd) || 0) : 0), 0),
    fuel_cost: fuel.reduce((s, f) => s + (Number(f.total_cost_usd) || 0), 0),
    gallons: fuel.reduce((s, f) => s + (Number(f.gallons) || 0), 0),
    maint_cost: maint.reduce((s, m) => s + (Number(m.cost_usd) || 0), 0),
    expenses_total: expenses.reduce((s, e) => s + (Number(e.amount_usd) || 0), 0),
    settled_pay: settlements.reduce((s, x) => s + (Number(x.gross_pay_usd) || 0), 0),
    miles_settled: settlements.reduce((s, x) => s + (Number(x.miles) || 0), 0),
    trip_miles: trips.reduce((s, x) => s + (Number(x.distance_mi) || 0), 0),
    ifta_miles: ifta.reduce((s, x) => s + (Number(x.miles) || 0), 0),
    ifta_gallons: ifta.reduce((s, x) => s + (Number(x.gallons) || 0), 0),
    inspections_total: inspections.length,
    inspections_failed: inspections.filter((i: any) => i.result && i.result !== "pass" && i.result !== "passed").length,
    active_hazards: hazards.length,
  };

  const expByCategory: Record<string, number> = {};
  for (const e of expenses) expByCategory[e.category] = (expByCategory[e.category] || 0) + (Number(e.amount_usd) || 0);

  const roundObj = <T extends Record<string, any>>(o: T) => {
    const out: any = {};
    for (const [k, v] of Object.entries(o)) out[k] = typeof v === "number" ? round(v) : v;
    return out;
  };

  const snapshot = {
    scope: {
      role: driverOnly ? "driver" : (scope.isOwner ? "owner" : "fleet_user"),
      user_id: scope.userId,
      company_id: scope.companyId,
      note: driverOnly
        ? "Only this driver's own loads, HOS, docs, fuel, expenses, inspections are included."
        : "Company-wide data.",
    },
    company: company ? { name: company.name, status: company.subscription_status, trial_ends_at: company.trial_ends_at, current_period_end: company.current_period_end } : null,
    subscription_plan: plan ? { name: plan.name, price_monthly_usd: plan.price_monthly_usd, max_trucks: plan.max_trucks, max_drivers: plan.max_drivers } : null,
    window: { since: sinceDate, days: 90 },
    totals: roundObj(totals),
    expenses_by_category: Object.fromEntries(Object.entries(expByCategory).map(([k, v]) => [k, round(v)])),
    hos_last_8d_minutes_by_driver: hosByDriver,
    trucks: Array.from(trucks.values()).map(roundObj).sort((a: any, b: any) => (b.fuel_cost + b.maint_cost) - (a.fuel_cost + a.maint_cost)).slice(0, 25),
    drivers: Array.from(drivers.values()).map(roundObj).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 25),
    active_loads_sample: loads.filter((l: any) => !["delivered", "completed", "cancelled"].includes(l.status)).slice(0, 20).map((l: any) => ({
      id: l.id, status: l.status, rate_usd: Number(l.rate_usd) || 0, from: l.shipper_address, to: l.consignee_address, pickup: l.pickup_at, delivery: l.delivery_at, unit: l.vehicle_unit,
    })),
    recent_inspections: inspections.slice(0, 15).map((i: any) => ({
      date: i.inspection_date, type: i.inspection_type, result: i.result, defects: i.defects_count, unit: i.vehicle_unit,
    })),
    active_hazards_sample: hazards.slice(0, 15).map((h: any) => ({
      type: h.hazard_type, severity: h.severity, lat: h.latitude, lng: h.longitude, description: h.description,
    })),
    expiring_documents: expiringDocs,
    recent_maintenance: maint.slice(0, 15).map((m: any) => ({ date: m.service_date, type: m.service_type, cost: Number(m.cost_usd) || 0, unit: m.vehicle_unit })),
  };

  return JSON.stringify(snapshot);
}
