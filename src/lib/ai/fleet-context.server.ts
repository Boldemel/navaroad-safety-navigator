import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Loads a compact, company-scoped profitability snapshot for the AI assistant.
 * Pulls last ~90 days of loads/fuel/expenses/settlements/maintenance/trips and
 * aggregates by vehicle_unit and driver where possible.
 */
export async function buildFleetContext(supabase: SupabaseClient): Promise<string> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sinceDate = since.slice(0, 10);

  const [loadsR, fuelR, expR, settR, maintR, tripsR, membersR] = await Promise.all([
    supabase.from("loads").select("id,user_id,status,rate_usd,pickup_at,delivery_at,shipper_address,consignee_address,weight_lbs,commodity").gte("created_at", since).limit(500),
    supabase.from("fuel_purchases").select("user_id,purchase_date,gallons,price_per_gallon,total_cost_usd,state_code,vehicle_unit,odometer").gte("purchase_date", sinceDate).limit(500),
    supabase.from("expenses").select("user_id,expense_date,category,amount_usd,vendor,state_code").gte("expense_date", sinceDate).limit(500),
    supabase.from("settlements").select("user_id,load_id,settlement_date,gross_pay_usd,miles,rate_per_mile,deductions_usd").gte("settlement_date", sinceDate).limit(500),
    supabase.from("maintenance_records").select("user_id,vehicle_unit,service_date,service_type,cost_usd,odometer,vendor").gte("service_date", sinceDate).limit(500),
    supabase.from("trip_logs").select("user_id,origin,destination,distance_mi,duration_min,fuel_cost,completed_at,safety_score,hazard_count").gte("completed_at", since).limit(500),
    supabase.from("company_members").select("id,user_id").limit(200),
  ]);

  const loads = loadsR.data ?? [];
  const fuel = fuelR.data ?? [];
  const expenses = expR.data ?? [];
  const settlements = settR.data ?? [];
  const maint = maintR.data ?? [];
  const trips = tripsR.data ?? [];

  // Per-truck (vehicle_unit) aggregates from fuel + maintenance
  type TruckAgg = { unit: string; fuel_cost: number; gallons: number; maint_cost: number; services: number };
  const trucks = new Map<string, TruckAgg>();
  const t = (u: string | null | undefined) => {
    const k = (u ?? "unassigned").toString();
    if (!trucks.has(k)) trucks.set(k, { unit: k, fuel_cost: 0, gallons: 0, maint_cost: 0, services: 0 });
    return trucks.get(k)!;
  };
  for (const f of fuel) {
    const a = t(f.vehicle_unit);
    a.fuel_cost += Number(f.total_cost_usd) || 0;
    a.gallons += Number(f.gallons) || 0;
  }
  for (const m of maint) {
    const a = t(m.vehicle_unit);
    a.maint_cost += Number(m.cost_usd) || 0;
    a.services += 1;
  }

  // Per-driver (user_id) aggregates
  type DrvAgg = { user_id: string; revenue: number; settled_pay: number; deductions: number; expenses: number; fuel_cost: number; gallons: number; loads_completed: number; miles_settled: number };
  const drivers = new Map<string, DrvAgg>();
  const d = (u: string) => {
    if (!drivers.has(u)) drivers.set(u, { user_id: u, revenue: 0, settled_pay: 0, deductions: 0, expenses: 0, fuel_cost: 0, gallons: 0, loads_completed: 0, miles_settled: 0 });
    return drivers.get(u)!;
  };
  for (const l of loads) {
    if (l.status === "delivered" || l.status === "completed") {
      const a = d(l.user_id); a.revenue += Number(l.rate_usd) || 0; a.loads_completed += 1;
    }
  }
  for (const s of settlements) {
    const a = d(s.user_id);
    a.settled_pay += Number(s.gross_pay_usd) || 0;
    a.deductions += Number(s.deductions_usd) || 0;
    a.miles_settled += Number(s.miles) || 0;
  }
  for (const e of expenses) { d(e.user_id).expenses += Number(e.amount_usd) || 0; }
  for (const f of fuel) {
    const a = d(f.user_id);
    a.fuel_cost += Number(f.total_cost_usd) || 0;
    a.gallons += Number(f.gallons) || 0;
  }

  // Company totals
  const totals = {
    loads_count: loads.length,
    loads_delivered: loads.filter((l) => l.status === "delivered" || l.status === "completed").length,
    revenue: loads.reduce((s, l) => s + ((l.status === "delivered" || l.status === "completed") ? (Number(l.rate_usd) || 0) : 0), 0),
    fuel_cost: fuel.reduce((s, f) => s + (Number(f.total_cost_usd) || 0), 0),
    gallons: fuel.reduce((s, f) => s + (Number(f.gallons) || 0), 0),
    maint_cost: maint.reduce((s, m) => s + (Number(m.cost_usd) || 0), 0),
    expenses_total: expenses.reduce((s, e) => s + (Number(e.amount_usd) || 0), 0),
    settled_pay: settlements.reduce((s, x) => s + (Number(x.gross_pay_usd) || 0), 0),
    miles_settled: settlements.reduce((s, x) => s + (Number(x.miles) || 0), 0),
    trips_count: trips.length,
    trip_miles: trips.reduce((s, x) => s + (Number(x.distance_mi) || 0), 0),
  };

  const expByCategory: Record<string, number> = {};
  for (const e of expenses) expByCategory[e.category] = (expByCategory[e.category] || 0) + (Number(e.amount_usd) || 0);

  const round = (n: number) => Math.round(n * 100) / 100;
  const r = <T extends Record<string, number | string>>(o: T) => {
    const out: any = {};
    for (const [k, v] of Object.entries(o)) out[k] = typeof v === "number" ? round(v) : v;
    return out;
  };

  const snapshot = {
    window: { since: sinceDate, days: 90 },
    totals: r(totals),
    expenses_by_category: Object.fromEntries(Object.entries(expByCategory).map(([k, v]) => [k, round(v)])),
    trucks: Array.from(trucks.values()).map(r).sort((a: any, b: any) => b.fuel_cost + b.maint_cost - (a.fuel_cost + a.maint_cost)).slice(0, 30),
    drivers: Array.from(drivers.values()).map(r).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 30),
    recent_loads_sample: loads.slice(0, 25).map((l) => ({
      status: l.status, rate_usd: Number(l.rate_usd) || 0,
      from: l.shipper_address, to: l.consignee_address,
      pickup: l.pickup_at, delivery: l.delivery_at,
    })),
  };

  return JSON.stringify(snapshot);
}
