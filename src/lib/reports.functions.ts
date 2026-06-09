import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  truck: z.string().max(80).optional(),
  driverId: z.string().uuid().optional(),
});
export type ReportFilters = z.infer<typeof FiltersSchema>;

export type TruckReportRow = {
  vehicleUnit: string;
  loads: number;
  miles: number;
  revenue: number;
  fuelCost: number;
  maintenanceCost: number;
  inspections: number;
  openDefects: number;
  lastInspectionAt: string | null;
};

export type DriverReportRow = {
  driverId: string;
  name: string;
  loads: number;
  miles: number;
  revenue: number;
  preTrip: number;
  postTrip: number;
  openDefects: number;
  expiringDocs: number;
};

export type DocExpirationRow = {
  id: string;
  title: string;
  docType: string;
  category: string | null;
  driverId: string | null;
  driverName: string | null;
  expiresOn: string | null;
  daysUntil: number | null;
  status: "expired" | "soon" | "ok";
};

export type FleetReport = {
  filters: ReportFilters;
  byTruck: TruckReportRow[];
  byDriver: DriverReportRow[];
  docExpirations: DocExpirationRow[];
  totals: {
    revenue: number;
    miles: number;
    fuelCost: number;
    maintenanceCost: number;
    loads: number;
    inspections: number;
    openDefects: number;
    expiredDocs: number;
    expiringDocs: number;
  };
};

const num = (v: unknown) => Number(v ?? 0) || 0;

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

export const getFleetReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FiltersSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<FleetReport> => {
    const supabase = context.supabase;
    const { from, to, truck, driverId } = data;

    const between = (q: any, col: string) => {
      if (from) q = q.gte(col, from);
      if (to) q = q.lte(col, to);
      return q;
    };

    const [settlementsRes, fuelRes, maintRes, inspectRes, docsRes, profilesRes] = await Promise.all([
      between(supabase.from("settlements").select("*"), "settlement_date"),
      between(supabase.from("fuel_purchases").select("*"), "purchase_date"),
      between(supabase.from("maintenance_records").select("*"), "service_date"),
      between(supabase.from("inspections").select("*"), "created_at"),
      supabase.from("documents").select("*"),
      supabase.from("profiles").select("id,driver_name,first_name,last_name"),
    ]);
    for (const r of [settlementsRes, fuelRes, maintRes, inspectRes, docsRes, profilesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const settlements = (settlementsRes.data ?? []) as any[];
    const fuel = (fuelRes.data ?? []) as any[];
    const maintenance = (maintRes.data ?? []) as any[];
    const inspections = (inspectRes.data ?? []) as any[];
    const docs = (docsRes.data ?? []) as any[];
    const profiles = (profilesRes.data ?? []) as any[];

    const nameFor = (id: string | null | undefined): string => {
      if (!id) return "Unassigned";
      const p = profiles.find((x) => x.id === id);
      if (!p) return "Driver";
      return p.driver_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Driver";
    };

    const truckOk = (u: string | null | undefined) => !truck || u === truck;
    const driverOk = (id: string | null | undefined) => !driverId || id === driverId;

    // ---- Truck rollup ----
    const truckMap = new Map<string, TruckReportRow>();
    const T = (u: string | null | undefined): TruckReportRow => {
      const k = u || "Unassigned";
      let r = truckMap.get(k);
      if (!r) {
        r = {
          vehicleUnit: k, loads: 0, miles: 0, revenue: 0,
          fuelCost: 0, maintenanceCost: 0,
          inspections: 0, openDefects: 0, lastInspectionAt: null,
        };
        truckMap.set(k, r);
      }
      return r;
    };
    for (const s of settlements) {
      if (!truckOk(s.vehicle_unit) || !driverOk(s.driver_id || s.user_id)) continue;
      const r = T(s.vehicle_unit);
      r.loads += s.load_id ? 1 : 0;
      r.miles += num(s.miles);
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
    }
    for (const f of fuel) {
      if (!truckOk(f.vehicle_unit) || !driverOk(f.driver_id || f.user_id)) continue;
      T(f.vehicle_unit).fuelCost += num(f.total_cost_usd);
    }
    for (const m of maintenance) {
      if (!truckOk(m.vehicle_unit)) continue;
      T(m.vehicle_unit).maintenanceCost += num(m.cost_usd);
    }
    for (const i of inspections) {
      if (!truckOk(i.vehicle_unit) || !driverOk(i.driver_id || i.user_id)) continue;
      const r = T(i.vehicle_unit);
      r.inspections += 1;
      const defects = Array.isArray(i.defects) ? i.defects.length : 0;
      if (i.defects_correction_required && defects > 0) r.openDefects += defects;
      if (!r.lastInspectionAt || i.created_at > r.lastInspectionAt) r.lastInspectionAt = i.created_at;
    }
    const byTruck = Array.from(truckMap.values()).sort((a, b) => b.revenue - a.revenue);

    // ---- Driver rollup ----
    const driverMap = new Map<string, DriverReportRow>();
    const D = (id: string): DriverReportRow => {
      let r = driverMap.get(id);
      if (!r) {
        r = {
          driverId: id, name: nameFor(id),
          loads: 0, miles: 0, revenue: 0,
          preTrip: 0, postTrip: 0, openDefects: 0,
          expiringDocs: 0,
        };
        driverMap.set(id, r);
      }
      return r;
    };
    for (const s of settlements) {
      const did = s.driver_id || s.user_id;
      if (!did || !truckOk(s.vehicle_unit) || !driverOk(did)) continue;
      const r = D(did);
      r.loads += s.load_id ? 1 : 0;
      r.miles += num(s.miles);
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
    }
    for (const i of inspections) {
      const did = i.driver_id || i.user_id;
      if (!did || !truckOk(i.vehicle_unit) || !driverOk(did)) continue;
      const r = D(did);
      if (i.inspection_type === "pre") r.preTrip += 1;
      else if (i.inspection_type === "post") r.postTrip += 1;
      const defects = Array.isArray(i.defects) ? i.defects.length : 0;
      if (i.defects_correction_required && defects > 0) r.openDefects += defects;
    }
    for (const d of docs) {
      if (!driverOk(d.driver_id)) continue;
      const n = daysUntil(d.expires_on);
      if (n != null && n <= 60 && d.driver_id) {
        D(d.driver_id).expiringDocs += 1;
      }
    }
    const byDriver = Array.from(driverMap.values()).sort((a, b) => b.revenue - a.revenue);

    // ---- Doc expirations ----
    const docExpirations: DocExpirationRow[] = docs
      .filter((d) => driverOk(d.driver_id))
      .map((d) => {
        const n = daysUntil(d.expires_on);
        const status: DocExpirationRow["status"] =
          n == null ? "ok" : n < 0 ? "expired" : n <= 60 ? "soon" : "ok";
        return {
          id: d.id,
          title: d.title,
          docType: d.doc_type,
          category: d.category ?? null,
          driverId: d.driver_id ?? null,
          driverName: d.driver_id ? nameFor(d.driver_id) : null,
          expiresOn: d.expires_on ?? null,
          daysUntil: n,
          status,
        };
      })
      .filter((r) => r.status !== "ok" || r.expiresOn)
      .sort((a, b) => {
        if (a.status === b.status) {
          return (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999);
        }
        const rank = (s: DocExpirationRow["status"]) => (s === "expired" ? 0 : s === "soon" ? 1 : 2);
        return rank(a.status) - rank(b.status);
      });

    // ---- Totals ----
    const totals = {
      revenue: byTruck.reduce((a, r) => a + r.revenue, 0),
      miles: byTruck.reduce((a, r) => a + r.miles, 0),
      fuelCost: byTruck.reduce((a, r) => a + r.fuelCost, 0),
      maintenanceCost: byTruck.reduce((a, r) => a + r.maintenanceCost, 0),
      loads: byTruck.reduce((a, r) => a + r.loads, 0),
      inspections: byTruck.reduce((a, r) => a + r.inspections, 0),
      openDefects: byTruck.reduce((a, r) => a + r.openDefects, 0),
      expiredDocs: docExpirations.filter((d) => d.status === "expired").length,
      expiringDocs: docExpirations.filter((d) => d.status === "soon").length,
    };

    return { filters: data, byTruck, byDriver, docExpirations, totals };
  });
