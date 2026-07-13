import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFeature } from "@/lib/fleetos/require-feature.server";

const FiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type TrucksFilters = z.infer<typeof FiltersSchema>;

export type TruckSummary = {
  vehicleUnit: string;
  revenue: number;
  fuelCost: number;
  maintenanceCost: number;
  netProfit: number;
  miles: number;
  loads: number;
  openDefects: number;
  openTasks: number;
  lastFuelOdometer: number | null;
  nextServiceDueDate: string | null;
  nextServiceDueOdometer: number | null;
  currentDriverId: string | null;
  currentDriverName: string | null;
  lastActivityAt: string | null;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

function nameFromProfile(p: any | undefined): string {
  if (!p) return "Driver";
  return p.driver_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Driver";
}

export const listTrucks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FiltersSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ trucks: TruckSummary[] }> => {
    const supabase = context.supabase;
    const { from, to } = data;

    const between = (q: any, col: string) => {
      if (from) q = q.gte(col, from);
      if (to) q = q.lte(col, to);
      return q;
    };

    const [settlementsRes, fuelRes, maintRes, loadsRes, inspectRes, tasksRes, profilesRes] = await Promise.all([
      between(supabase.from("settlements").select("vehicle_unit,gross_pay_usd,linehaul_revenue_usd,gross_revenue_usd,miles,load_id,driver_id,user_id,settlement_date"), "settlement_date"),
      between(supabase.from("fuel_purchases").select("vehicle_unit,total_cost_usd,odometer,purchase_date"), "purchase_date"),
      between(supabase.from("maintenance_records").select("vehicle_unit,cost_usd,service_date,next_due_date,next_due_odometer"), "service_date"),
      supabase.from("loads").select("vehicle_unit,driver_id,user_id,updated_at,status,is_current"),
      supabase.from("inspections").select("vehicle_unit,defects,defects_correction_required,created_at,driver_id,user_id"),
      supabase.from("maintenance_tasks").select("vehicle_unit,status"),
      supabase.from("profiles").select("id,driver_name,first_name,last_name"),
    ]);
    for (const r of [settlementsRes, fuelRes, maintRes, loadsRes, inspectRes, tasksRes, profilesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const profiles = (profilesRes.data ?? []) as any[];
    const map = new Map<string, TruckSummary>();
    const T = (u: string | null | undefined): TruckSummary => {
      const k = u || "Unassigned";
      let r = map.get(k);
      if (!r) {
        r = {
          vehicleUnit: k,
          revenue: 0, fuelCost: 0, maintenanceCost: 0, netProfit: 0,
          miles: 0, loads: 0, openDefects: 0, openTasks: 0,
          lastFuelOdometer: null, nextServiceDueDate: null, nextServiceDueOdometer: null,
          currentDriverId: null, currentDriverName: null, lastActivityAt: null,
        };
        map.set(k, r);
      }
      return r;
    };

    for (const s of (settlementsRes.data ?? []) as any[]) {
      const r = T(s.vehicle_unit);
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
      r.miles += num(s.miles);
      if (s.load_id) r.loads += 1;
    }
    const fuelByTruck = new Map<string, { lastOdo: number | null; lastDate: string | null }>();
    for (const f of (fuelRes.data ?? []) as any[]) {
      const r = T(f.vehicle_unit);
      r.fuelCost += num(f.total_cost_usd);
      const key = f.vehicle_unit || "Unassigned";
      const prev = fuelByTruck.get(key) ?? { lastOdo: null, lastDate: null };
      if (f.odometer != null && (!prev.lastDate || f.purchase_date > prev.lastDate)) {
        prev.lastOdo = num(f.odometer);
        prev.lastDate = f.purchase_date;
      }
      fuelByTruck.set(key, prev);
    }
    for (const [k, v] of fuelByTruck) T(k).lastFuelOdometer = v.lastOdo;

    const maintByTruck = new Map<string, { dueDate: string | null; dueOdo: number | null }>();
    for (const m of (maintRes.data ?? []) as any[]) {
      const r = T(m.vehicle_unit);
      r.maintenanceCost += num(m.cost_usd);
      const key = m.vehicle_unit || "Unassigned";
      const prev = maintByTruck.get(key) ?? { dueDate: null, dueOdo: null };
      if (m.next_due_date && (!prev.dueDate || m.next_due_date < prev.dueDate)) prev.dueDate = m.next_due_date;
      if (m.next_due_odometer != null && (prev.dueOdo == null || m.next_due_odometer < prev.dueOdo)) prev.dueOdo = m.next_due_odometer;
      maintByTruck.set(key, prev);
    }
    for (const [k, v] of maintByTruck) {
      const r = T(k);
      r.nextServiceDueDate = v.dueDate;
      r.nextServiceDueOdometer = v.dueOdo;
    }

    for (const i of (inspectRes.data ?? []) as any[]) {
      const r = T(i.vehicle_unit);
      const defects = Array.isArray(i.defects) ? i.defects.length : 0;
      if (i.defects_correction_required && defects > 0) r.openDefects += defects;
      if (!r.lastActivityAt || i.created_at > r.lastActivityAt) r.lastActivityAt = i.created_at;
    }
    for (const t of (tasksRes.data ?? []) as any[]) {
      if (t.status === "Open" || t.status === "InProgress") T(t.vehicle_unit).openTasks += 1;
    }

    // Current driver: most recent active load per truck
    const latestLoad = new Map<string, any>();
    for (const l of (loadsRes.data ?? []) as any[]) {
      const k = l.vehicle_unit || "Unassigned";
      const prev = latestLoad.get(k);
      if (!prev || (l.updated_at && l.updated_at > prev.updated_at)) latestLoad.set(k, l);
      const r = T(l.vehicle_unit);
      if (l.updated_at && (!r.lastActivityAt || l.updated_at > r.lastActivityAt)) r.lastActivityAt = l.updated_at;
    }
    for (const [k, l] of latestLoad) {
      const did = l.driver_id || l.user_id;
      const r = T(k);
      r.currentDriverId = did ?? null;
      r.currentDriverName = did ? nameFromProfile(profiles.find((p) => p.id === did)) : null;
    }

    for (const r of map.values()) r.netProfit = r.revenue - r.fuelCost - r.maintenanceCost;

    const trucks = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    return { trucks };
  });

export type TruckDetail = {
  summary: TruckSummary;
  recentLoads: {
    id: string; status: string; pickup: string | null; delivery: string | null;
    shipper: string | null; consignee: string | null; rate: number; miles: number;
    driverName: string | null;
  }[];
  recentMaintenance: {
    id: string; serviceDate: string; serviceType: string; cost: number;
    vendor: string | null; nextDueDate: string | null; nextDueOdometer: number | null;
  }[];
  openDefects: {
    id: string; description: string; priority: string; status: string;
    category: string | null; createdAt: string;
  }[];
  recentFuel: {
    id: string; date: string; station: string | null; state: string;
    gallons: number; total: number; odometer: number | null;
  }[];
};

export const getTruckDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    vehicleUnit: z.string().min(1).max(80),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<TruckDetail> => {
    const supabase = context.supabase;
    const { vehicleUnit, from, to } = data;

    const summaryRes = await listTrucks({ data: { from, to } });
    const summary = summaryRes.trucks.find((t) => t.vehicleUnit === vehicleUnit) ?? {
      vehicleUnit, revenue: 0, fuelCost: 0, maintenanceCost: 0, netProfit: 0,
      miles: 0, loads: 0, openDefects: 0, openTasks: 0,
      lastFuelOdometer: null, nextServiceDueDate: null, nextServiceDueOdometer: null,
      currentDriverId: null, currentDriverName: null, lastActivityAt: null,
    };

    const [loadsRes, maintRes, tasksRes, fuelRes, profilesRes] = await Promise.all([
      supabase.from("loads").select("id,status,pickup_at,delivery_at,shipper_name,consignee_name,rate_usd,total_miles,driver_id,user_id,updated_at")
        .eq("vehicle_unit", vehicleUnit).order("updated_at", { ascending: false }).limit(15),
      supabase.from("maintenance_records").select("id,service_date,service_type,cost_usd,vendor,next_due_date,next_due_odometer")
        .eq("vehicle_unit", vehicleUnit).order("service_date", { ascending: false }).limit(15),
      supabase.from("maintenance_tasks").select("id,defect_description,priority,status,defect_category,created_at")
        .eq("vehicle_unit", vehicleUnit).in("status", ["Open", "InProgress"]).order("created_at", { ascending: false }),
      supabase.from("fuel_purchases").select("id,purchase_date,station_name,state_code,gallons,total_cost_usd,odometer")
        .eq("vehicle_unit", vehicleUnit).order("purchase_date", { ascending: false }).limit(15),
      supabase.from("profiles").select("id,driver_name,first_name,last_name"),
    ]);
    for (const r of [loadsRes, maintRes, tasksRes, fuelRes, profilesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const profiles = (profilesRes.data ?? []) as any[];

    return {
      summary,
      recentLoads: ((loadsRes.data ?? []) as any[]).map((l) => {
        const did = l.driver_id || l.user_id;
        return {
          id: l.id, status: l.status, pickup: l.pickup_at, delivery: l.delivery_at,
          shipper: l.shipper_name, consignee: l.consignee_name,
          rate: num(l.rate_usd), miles: num(l.total_miles),
          driverName: did ? nameFromProfile(profiles.find((p) => p.id === did)) : null,
        };
      }),
      recentMaintenance: ((maintRes.data ?? []) as any[]).map((m) => ({
        id: m.id, serviceDate: m.service_date, serviceType: m.service_type,
        cost: num(m.cost_usd), vendor: m.vendor,
        nextDueDate: m.next_due_date, nextDueOdometer: m.next_due_odometer,
      })),
      openDefects: ((tasksRes.data ?? []) as any[]).map((t) => ({
        id: t.id, description: t.defect_description, priority: t.priority,
        status: t.status, category: t.defect_category, createdAt: t.created_at,
      })),
      recentFuel: ((fuelRes.data ?? []) as any[]).map((f) => ({
        id: f.id, date: f.purchase_date, station: f.station_name, state: f.state_code,
        gallons: num(f.gallons), total: num(f.total_cost_usd), odometer: f.odometer,
      })),
    };
  });
