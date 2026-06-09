import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  truck: z.string().max(80).optional(),
  driverId: z.string().uuid().optional(),
});
export type DriverPerfFilters = z.infer<typeof FiltersSchema>;

export type HosViolation = {
  date: string;
  drivingHours: number;
  onDutyHours: number;
  type: "driving_11" | "on_duty_14";
};

export type DriverDocSummary = {
  id: string;
  title: string;
  docType: string;
  category: string | null;
  expiresOn: string | null;
  daysUntil: number | null;
  status: "expired" | "soon" | "ok";
};

export type DriverScorecard = {
  driverId: string;
  name: string;
  loads: number;
  miles: number;
  revenue: number;
  onTimeRate: number | null; // 0..1
  loadsOnTime: number;
  loadsScored: number;
  preTrip: number;
  postTrip: number;
  openDefects: number;
  hosViolations: number;
  expiredDocs: number;
  expiringDocs: number;
  compliance: number; // 0..100
  violations: HosViolation[];
  docs: DriverDocSummary[];
};

export type DriverPerformanceReport = {
  filters: DriverPerfFilters;
  drivers: DriverScorecard[];
  totals: {
    drivers: number;
    revenue: number;
    miles: number;
    loads: number;
    hosViolations: number;
    expiredDocs: number;
  };
};

const num = (v: unknown) => Number(v ?? 0) || 0;

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function hoursBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
}

export const getDriverPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FiltersSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<DriverPerformanceReport> => {
    const supabase = context.supabase;
    const { from, to, truck, driverId } = data;

    const between = (q: any, col: string) => {
      if (from) q = q.gte(col, from);
      if (to) q = q.lte(col, to);
      return q;
    };

    const [settlementsRes, loadsRes, inspectRes, docsRes, dutyRes, profilesRes] = await Promise.all([
      between(supabase.from("settlements").select("*"), "settlement_date"),
      supabase.from("loads").select("*").eq("status", "delivered"),
      between(supabase.from("inspections").select("*"), "created_at"),
      supabase.from("documents").select("*"),
      between(supabase.from("duty_status_logs").select("*"), "started_at"),
      supabase.from("profiles").select("id,driver_name,first_name,last_name"),
    ]);
    for (const r of [settlementsRes, loadsRes, inspectRes, docsRes, dutyRes, profilesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const settlements = (settlementsRes.data ?? []) as any[];
    const loads = (loadsRes.data ?? []) as any[];
    const inspections = (inspectRes.data ?? []) as any[];
    const docs = (docsRes.data ?? []) as any[];
    const duty = (dutyRes.data ?? []) as any[];
    const profiles = (profilesRes.data ?? []) as any[];

    const nameFor = (id: string): string => {
      const p = profiles.find((x) => x.id === id);
      if (!p) return "Driver";
      return p.driver_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Driver";
    };

    const truckOk = (u: string | null | undefined) => !truck || u === truck;
    const driverOk = (id: string | null | undefined) => !driverId || id === driverId;

    // Seed driver map from settlements (active drivers in window)
    const map = new Map<string, DriverScorecard>();
    const D = (id: string): DriverScorecard => {
      let r = map.get(id);
      if (!r) {
        r = {
          driverId: id, name: nameFor(id),
          loads: 0, miles: 0, revenue: 0,
          onTimeRate: null, loadsOnTime: 0, loadsScored: 0,
          preTrip: 0, postTrip: 0, openDefects: 0,
          hosViolations: 0, expiredDocs: 0, expiringDocs: 0,
          compliance: 0, violations: [], docs: [],
        };
        map.set(id, r);
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

    // On-time from loads
    for (const l of loads) {
      const did = l.driver_id || l.user_id;
      if (!did || !truckOk(l.vehicle_unit) || !driverOk(did)) continue;
      if (!l.delivery_at) continue;
      const completedAt = l.updated_at || l.delivery_at;
      if (from && completedAt < from) continue;
      if (to && completedAt > to + "T23:59:59") continue;
      const r = D(did);
      r.loadsScored += 1;
      const sched = new Date(l.delivery_at).getTime();
      const actual = new Date(completedAt).getTime();
      if (actual <= sched + 30 * 60_000) r.loadsOnTime += 1;
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

    // HOS violations — bucket duty entries per driver per day
    type DayAgg = { driving: number; onDuty: number };
    const dutyByDriver = new Map<string, Map<string, DayAgg>>();
    for (const d of duty) {
      const did = d.user_id;
      if (!did || !truckOk(d.vehicle_unit) || !driverOk(did)) continue;
      if (!d.started_at) continue;
      const end = d.ended_at || new Date().toISOString();
      const hrs = hoursBetween(d.started_at, end);
      const key = dateKey(d.started_at);
      let m = dutyByDriver.get(did);
      if (!m) { m = new Map(); dutyByDriver.set(did, m); }
      let agg = m.get(key);
      if (!agg) { agg = { driving: 0, onDuty: 0 }; m.set(key, agg); }
      const st = String(d.status || "").toLowerCase();
      if (st === "driving") { agg.driving += hrs; agg.onDuty += hrs; }
      else if (st === "on_duty" || st === "on-duty" || st === "on duty") { agg.onDuty += hrs; }
    }
    for (const [did, days] of dutyByDriver) {
      const r = D(did);
      for (const [date, agg] of days) {
        if (agg.driving > 11) {
          r.violations.push({ date, drivingHours: +agg.driving.toFixed(2), onDutyHours: +agg.onDuty.toFixed(2), type: "driving_11" });
        }
        if (agg.onDuty > 14) {
          r.violations.push({ date, drivingHours: +agg.driving.toFixed(2), onDutyHours: +agg.onDuty.toFixed(2), type: "on_duty_14" });
        }
      }
      r.violations.sort((a, b) => (a.date < b.date ? 1 : -1));
      r.hosViolations = r.violations.length;
    }

    // Docs per driver
    for (const d of docs) {
      if (!d.driver_id || !driverOk(d.driver_id)) continue;
      const n = daysUntil(d.expires_on);
      const status: DriverDocSummary["status"] = n == null ? "ok" : n < 0 ? "expired" : n <= 60 ? "soon" : "ok";
      const r = D(d.driver_id);
      if (status === "expired") r.expiredDocs += 1;
      else if (status === "soon") r.expiringDocs += 1;
      r.docs.push({
        id: d.id, title: d.title, docType: d.doc_type,
        category: d.category ?? null, expiresOn: d.expires_on ?? null,
        daysUntil: n, status,
      });
    }

    // Finalize scoring
    const drivers: DriverScorecard[] = [];
    for (const r of map.values()) {
      r.onTimeRate = r.loadsScored > 0 ? r.loadsOnTime / r.loadsScored : null;
      // Compliance: 40 docs, 30 HOS, 20 on-time, 10 defects
      let score = 100;
      if (r.expiredDocs > 0) score -= 40;
      else if (r.expiringDocs > 0) score -= 15;
      if (r.hosViolations > 0) score -= Math.min(30, r.hosViolations * 10);
      if (r.onTimeRate != null && r.onTimeRate < 0.9) score -= Math.round((0.9 - r.onTimeRate) * 100);
      if (r.openDefects > 0) score -= Math.min(10, r.openDefects * 2);
      r.compliance = Math.max(0, Math.min(100, score));
      r.docs.sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));
      drivers.push(r);
    }
    drivers.sort((a, b) => b.revenue - a.revenue);

    return {
      filters: data,
      drivers,
      totals: {
        drivers: drivers.length,
        revenue: drivers.reduce((a, r) => a + r.revenue, 0),
        miles: drivers.reduce((a, r) => a + r.miles, 0),
        loads: drivers.reduce((a, r) => a + r.loads, 0),
        hosViolations: drivers.reduce((a, r) => a + r.hosViolations, 0),
        expiredDocs: drivers.reduce((a, r) => a + r.expiredDocs, 0),
      },
    };
  });
