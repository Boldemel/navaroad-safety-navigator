import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFeature } from "@/lib/fleetos/require-feature.server";

const FiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  truck: z.string().max(80).optional(),
  driverId: z.string().uuid().optional(),
  loadId: z.string().uuid().optional(),
  broker: z.string().max(160).optional(),
  lane: z.string().max(160).optional(),
});
export type ProfitabilityFilters = z.infer<typeof FiltersSchema>;

export type ProfitRow = {
  key: string;
  label: string;
  sublabel?: string | null;
  revenue: number;
  fuel: number;
  maintenance: number;
  driverPay: number;
  otherExpenses: number;
  totalCost: number;
  netProfit: number;
  miles: number;
  revenuePerMile: number;
  costPerMile: number;
  profitPerMile: number;
  loadsCompleted?: number;
};

export type Overview = ProfitRow;

export type Highlights = {
  mostProfitableTruck: ProfitRow | null;
  leastProfitableTruck: ProfitRow | null;
  mostProfitableLoad: ProfitRow | null;
  losingLoads: ProfitRow[];
  highestFuelCpmTruck: (ProfitRow & { fuelPerMile: number }) | null;
  highestMaintTruck: ProfitRow | null;
};

export type FilterOptions = {
  trucks: string[];
  drivers: { id: string; name: string }[];
  loads: { id: string; label: string }[];
  brokers: string[];
  lanes: string[];
};

export type ProfitabilityReport = {
  filters: ProfitabilityFilters;
  overview: Overview;
  byTruck: ProfitRow[];
  byDriver: ProfitRow[];
  byLoad: ProfitRow[];
  byLane: ProfitRow[];
  byBroker: ProfitRow[];
  highlights: Highlights;
  options: FilterOptions;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

// Normalize an address to "City, ST" when possible; fall back to truncated string.
function shortPlace(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0].slice(0, 40);
  const last = parts[parts.length - 1];
  const stateMatch = last.match(/\b([A-Z]{2})\b/);
  const stateOrLast = stateMatch ? stateMatch[1] : last.slice(0, 12);
  const city = parts[parts.length - 2];
  return `${city}, ${stateOrLast}`;
}
function laneOf(load: any): string | null {
  const o = shortPlace(load?.shipper_address);
  const d = shortPlace(load?.consignee_address);
  if (!o && !d) return null;
  return `${o ?? "?"} → ${d ?? "?"}`;
}
function brokerOf(load: any): string | null {
  return load?.shipper_name ?? load?.consignee_name ?? null;
}

function emptyRow(key: string, label: string, sublabel?: string | null): ProfitRow {
  return {
    key, label, sublabel: sublabel ?? null,
    revenue: 0, fuel: 0, maintenance: 0, driverPay: 0, otherExpenses: 0,
    totalCost: 0, netProfit: 0, miles: 0,
    revenuePerMile: 0, costPerMile: 0, profitPerMile: 0,
  };
}
function finalize(r: ProfitRow): ProfitRow {
  r.totalCost = r.fuel + r.maintenance + r.driverPay + r.otherExpenses;
  r.netProfit = r.revenue - r.totalCost;
  r.revenuePerMile = r.miles > 0 ? r.revenue / r.miles : 0;
  r.costPerMile = r.miles > 0 ? r.totalCost / r.miles : 0;
  r.profitPerMile = r.miles > 0 ? r.netProfit / r.miles : 0;
  return r;
}

export const getProfitabilityReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FiltersSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ProfitabilityReport> => {
    const supabase = context.supabase;
    const { from, to, truck, driverId, loadId, broker, lane } = data;

    const dateBetween = (q: any, col: string) => {
      if (from) q = q.gte(col, from);
      if (to) q = q.lte(col, to);
      return q;
    };

    const [settlementsRes, fuelRes, maintRes, expensesRes, loadsRes, profilesRes] = await Promise.all([
      dateBetween(supabase.from("settlements").select("*"), "settlement_date"),
      dateBetween(supabase.from("fuel_purchases").select("*"), "purchase_date"),
      dateBetween(supabase.from("maintenance_records").select("*"), "service_date"),
      dateBetween(supabase.from("expenses").select("*"), "expense_date"),
      supabase.from("loads").select("id,bol_number,shipper_name,shipper_address,consignee_name,consignee_address,rate_usd,total_miles,delivery_at,status,user_id"),
      supabase.from("profiles").select("id,driver_name"),
    ]);
    for (const r of [settlementsRes, fuelRes, maintRes, expensesRes, loadsRes, profilesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    let settlements = (settlementsRes.data ?? []) as any[];
    let fuel = (fuelRes.data ?? []) as any[];
    let maintenance = (maintRes.data ?? []) as any[];
    let expenses = (expensesRes.data ?? []) as any[];
    const loads = (loadsRes.data ?? []) as any[];
    const profileMap = new Map<string, string>(
      (profilesRes.data ?? []).map((p: any) => [p.id, p.driver_name || "Driver"])
    );
    const loadById = new Map<string, any>(loads.map((l) => [l.id, l]));

    // Build filter options from unfiltered universe.
    const optTrucks = new Set<string>();
    const optDrivers = new Map<string, string>();
    const optBrokers = new Set<string>();
    const optLanes = new Set<string>();
    for (const s of settlements) {
      if (s.vehicle_unit) optTrucks.add(s.vehicle_unit);
      const did = s.driver_id || s.user_id;
      if (did) optDrivers.set(did, profileMap.get(did) || "Driver");
    }
    for (const f of fuel) if (f.vehicle_unit) optTrucks.add(f.vehicle_unit);
    for (const m of maintenance) if (m.vehicle_unit) optTrucks.add(m.vehicle_unit);
    for (const l of loads) {
      const b = brokerOf(l); if (b) optBrokers.add(b);
      const ln = laneOf(l); if (ln) optLanes.add(ln);
    }

    // Apply filters.
    const allowedLoadIds = new Set<string>();
    let useLoadFilter = false;
    if (loadId) { useLoadFilter = true; allowedLoadIds.add(loadId); }
    if (broker || lane) {
      useLoadFilter = true;
      for (const l of loads) {
        const okBroker = !broker || brokerOf(l) === broker;
        const okLane = !lane || laneOf(l) === lane;
        if (okBroker && okLane) allowedLoadIds.add(l.id);
      }
    }
    const loadOk = (id: string | null | undefined) =>
      !useLoadFilter ? true : !!(id && allowedLoadIds.has(id));
    const truckOk = (u: string | null | undefined) => !truck || u === truck;
    const driverOk = (id: string | null | undefined) => !driverId || id === driverId;

    settlements = settlements.filter((s) =>
      truckOk(s.vehicle_unit) && driverOk(s.driver_id || s.user_id) && loadOk(s.load_id),
    );
    fuel = fuel.filter((f) => truckOk(f.vehicle_unit) && driverOk(f.user_id) && loadOk(f.load_id));
    maintenance = maintenance.filter((m) => truckOk(m.vehicle_unit));
    expenses = expenses.filter((e) => {
      if (e.category === "Fuel" || e.category === "Maintenance") return false;
      return truckOk(e.vehicle_unit) && driverOk(e.user_id) && loadOk(e.load_id);
    });

    // Loads-for-options after settlements filter (only show loads with activity).
    const seenLoadIds = new Set<string>();
    for (const s of settlements) if (s.load_id) seenLoadIds.add(s.load_id);

    // ---- Overview ----
    const overview = emptyRow("overview", "Fleet Total");
    for (const s of settlements) {
      overview.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
      overview.miles += num(s.miles);
      overview.driverPay += num(s.net_settlement_usd ?? s.gross_pay_usd);
    }
    for (const f of fuel) overview.fuel += num(f.total_cost_usd);
    for (const m of maintenance) overview.maintenance += num(m.cost_usd);
    for (const e of expenses) overview.otherExpenses += num(e.amount_usd);
    finalize(overview);

    // ---- By Truck ----
    const truckMap = new Map<string, ProfitRow>();
    const T = (u: string | null | undefined) => {
      const k = u || "Unassigned";
      let r = truckMap.get(k);
      if (!r) { r = emptyRow(k, k); truckMap.set(k, r); }
      return r;
    };
    for (const s of settlements) {
      const r = T(s.vehicle_unit);
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
      r.miles += num(s.miles);
      r.driverPay += num(s.net_settlement_usd ?? s.gross_pay_usd);
    }
    for (const f of fuel) T(f.vehicle_unit).fuel += num(f.total_cost_usd);
    for (const m of maintenance) T(m.vehicle_unit).maintenance += num(m.cost_usd);
    for (const e of expenses) T(e.vehicle_unit).otherExpenses += num(e.amount_usd);
    const byTruck = Array.from(truckMap.values()).map(finalize).sort((a, b) => b.netProfit - a.netProfit);

    // ---- By Driver ----
    const driverMap = new Map<string, ProfitRow>();
    const D = (id: string) => {
      let r = driverMap.get(id);
      if (!r) { r = emptyRow(id, profileMap.get(id) || "Driver"); r.loadsCompleted = 0; driverMap.set(id, r); }
      return r;
    };
    const driverLoadSet = new Map<string, Set<string>>();
    for (const s of settlements) {
      const did = s.driver_id || s.user_id;
      if (!did) continue;
      const r = D(did);
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
      r.miles += num(s.miles);
      r.driverPay += num(s.net_settlement_usd ?? s.gross_pay_usd);
      if (s.load_id) {
        if (!driverLoadSet.has(did)) driverLoadSet.set(did, new Set());
        driverLoadSet.get(did)!.add(s.load_id);
      }
    }
    for (const f of fuel) { if (f.user_id) D(f.user_id).fuel += num(f.total_cost_usd); }
    for (const e of expenses) { if (e.user_id) D(e.user_id).otherExpenses += num(e.amount_usd); }
    for (const [did, set] of driverLoadSet) { const r = driverMap.get(did); if (r) r.loadsCompleted = set.size; }
    const byDriver = Array.from(driverMap.values()).map(finalize).sort((a, b) => b.netProfit - a.netProfit);

    // ---- By Load ----
    const loadMap = new Map<string, ProfitRow>();
    const L = (id: string) => {
      let r = loadMap.get(id);
      if (!r) {
        const l = loadById.get(id);
        const label = l?.bol_number || id.slice(0, 8);
        const sub = l ? (brokerOf(l) ?? laneOf(l)) : null;
        r = emptyRow(id, label, sub);
        loadMap.set(id, r);
      }
      return r;
    };
    for (const s of settlements) {
      if (!s.load_id) continue;
      const r = L(s.load_id);
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
      r.miles += num(s.miles);
      r.driverPay += num(s.net_settlement_usd ?? s.gross_pay_usd);
    }
    for (const f of fuel) if (f.load_id) L(f.load_id).fuel += num(f.total_cost_usd);
    for (const e of expenses) if (e.load_id) L(e.load_id).otherExpenses += num(e.amount_usd);
    const byLoad = Array.from(loadMap.values()).map(finalize).sort((a, b) => b.netProfit - a.netProfit);

    // ---- By Lane & Broker (aggregate from byLoad via load lookup) ----
    const laneMap = new Map<string, ProfitRow>();
    const brokerMap = new Map<string, ProfitRow>();
    for (const row of byLoad) {
      const l = loadById.get(row.key);
      const ln = (l && laneOf(l)) || "Unknown lane";
      const br = (l && brokerOf(l)) || "Unknown broker";

      const accumulate = (target: ProfitRow) => {
        target.revenue += row.revenue;
        target.fuel += row.fuel;
        target.maintenance += row.maintenance;
        target.driverPay += row.driverPay;
        target.otherExpenses += row.otherExpenses;
        target.miles += row.miles;
        target.loadsCompleted = (target.loadsCompleted ?? 0) + 1;
      };

      let laneRow = laneMap.get(ln);
      if (!laneRow) { laneRow = emptyRow(ln, ln); laneRow.loadsCompleted = 0; laneMap.set(ln, laneRow); }
      accumulate(laneRow);

      let brokerRow = brokerMap.get(br);
      if (!brokerRow) { brokerRow = emptyRow(br, br); brokerRow.loadsCompleted = 0; brokerMap.set(br, brokerRow); }
      accumulate(brokerRow);
    }
    const byLane = Array.from(laneMap.values()).map(finalize).sort((a, b) => b.netProfit - a.netProfit);
    const byBroker = Array.from(brokerMap.values()).map(finalize).sort((a, b) => b.netProfit - a.netProfit);

    // ---- Highlights ----
    const trucksWithMiles = byTruck.filter((t) => t.miles > 0);
    const mostProfitableTruck = byTruck[0] ?? null;
    const leastProfitableTruck = byTruck.length > 1 ? byTruck[byTruck.length - 1] : null;
    const mostProfitableLoad = byLoad[0] ?? null;
    const losingLoads = byLoad.filter((l) => l.netProfit < 0).slice(0, 5);
    const highestFuelCpmTruck = trucksWithMiles.length
      ? (() => {
          const t = [...trucksWithMiles].sort((a, b) => (b.fuel / b.miles) - (a.fuel / a.miles))[0];
          return { ...t, fuelPerMile: t.miles > 0 ? t.fuel / t.miles : 0 };
        })()
      : null;
    const highestMaintTruck = byTruck.length
      ? [...byTruck].sort((a, b) => b.maintenance - a.maintenance)[0] ?? null
      : null;

    const highlights: Highlights = {
      mostProfitableTruck, leastProfitableTruck, mostProfitableLoad,
      losingLoads, highestFuelCpmTruck, highestMaintTruck,
    };

    const options: FilterOptions = {
      trucks: Array.from(optTrucks).sort(),
      drivers: Array.from(optDrivers.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      loads: loads
        .filter((l) => seenLoadIds.has(l.id))
        .map((l) => ({ id: l.id, label: l.bol_number || l.id.slice(0, 8) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      brokers: Array.from(optBrokers).sort(),
      lanes: Array.from(optLanes).sort(),
    };

    return { filters: data, overview, byTruck, byDriver, byLoad, byLane, byBroker, highlights, options };
  });
