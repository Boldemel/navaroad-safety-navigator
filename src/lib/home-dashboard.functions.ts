import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HomeDashboardData = {
  companyId: string;
  fleet: {
    activeTrucks: number;
    driversOnDuty: number;
    loadsInTransit: number;
    deliveriesToday: number;
    activeAlerts: number;
    pendingInspections: number;
  };
  financial: {
    revenueToday: number;
    expensesToday: number;
    profitToday: number;
    revenuePerMile: number | null;
    fuelCostToday: number;
    averageMpg: number | null;
    settlementTotal30d: number;
    outstandingInvoices: number;
  };
  performance7d: {
    labels: string[];
    revenue: number[];
    expenses: number[];
    profit: number[];
    miles: number[];
    fuel: number[];
  };
  recentLoads: Array<{ id: string; label: string; status: string; rateUsd: number | null }>;
  recentSettlements: Array<{ id: string; label: string; amountUsd: number; status: string }>;
  recentMaintenance: Array<{ id: string; label: string; detail: string }>;
  activity: Array<{ text: string; at: string }>;
  alertsFeed: Array<{ text: string; severity: string; at: string }>;
};

function startOfDay(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

/**
 * Real company-scoped metrics for the Home dashboard. Every query runs as the
 * signed-in user under RLS, so only the caller's own company data is read.
 * A brand-new company gets truthful zeros — never demo numbers.
 */
export const getHomeDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeDashboardData | null> => {
    const { supabase, userId } = context;

    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!mem) return null;
    const companyId = mem.company_id as string;

    const todayStart = startOfDay(new Date());
    const todayDate = todayStart.slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 6 * 86_400_000);
    const sevenDaysAgoDate = startOfDay(sevenDaysAgo).slice(0, 10);

    const sum = (rows: any[] | null, col: string) =>
      (rows ?? []).reduce((acc, r) => acc + (Number(r[col]) || 0), 0);

    const [
      trucksRes,
      dutyRes,
      transitRes,
      deliveredTodayRes,
      alertsRes,
      openTasksRes,
      settlementsTodayRes,
      expensesTodayRes,
      fuelTodayRes,
      settlements30dRes,
      outstandingRes,
      settlements7dRes,
      expenses7dRes,
      fuel7dRes,
      trips7dRes,
      recentLoadsRes,
      recentSettlementsRes,
      recentMaintRes,
      recentTripsRes,
      alertsFeedRes,
    ] = await Promise.all([
      supabase.rpc("company_truck_units", { _company: companyId }),
      supabase.from("duty_status_logs").select("user_id").is("ended_at", null),
      supabase.from("loads").select("id", { count: "exact", head: true }).eq("status", "in_transit"),
      supabase.from("loads").select("id", { count: "exact", head: true }).gte("delivered_at", todayStart),
      supabase.from("alerts").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("maintenance_tasks").select("id", { count: "exact", head: true }).eq("status", "Open"),
      supabase.from("settlements").select("gross_revenue_usd, miles").eq("settlement_date", todayDate),
      supabase.from("expenses").select("amount_usd").eq("expense_date", todayDate),
      supabase.from("fuel_purchases").select("total_cost_usd").eq("purchase_date", todayDate),
      supabase.from("settlements").select("gross_revenue_usd").gte("settlement_date", thirtyDaysAgo),
      supabase.from("settlements").select("gross_revenue_usd").neq("status", "paid"),
      supabase.from("settlements").select("settlement_date, gross_revenue_usd").gte("settlement_date", sevenDaysAgoDate),
      supabase.from("expenses").select("expense_date, amount_usd").gte("expense_date", sevenDaysAgoDate),
      supabase.from("fuel_purchases").select("purchase_date, total_cost_usd").gte("purchase_date", sevenDaysAgoDate),
      supabase.from("trip_logs").select("route_date, completed_at, distance_mi").gte("completed_at", startOfDay(sevenDaysAgo)),
      supabase.from("loads").select("id, bol_number, shipper_name, consignee_name, status, rate_usd")
        .order("created_at", { ascending: false }).limit(3),
      supabase.from("settlements").select("id, payer, customer, gross_revenue_usd, status, settlement_date")
        .order("settlement_date", { ascending: false }).limit(3),
      supabase.from("maintenance_records").select("id, vehicle_unit, service_type, service_date")
        .order("service_date", { ascending: false }).limit(3),
      supabase.from("trip_logs").select("id, origin, destination, completed_at")
        .order("completed_at", { ascending: false }).limit(5),
      supabase.from("alerts").select("message, severity, created_at")
        .eq("active", true).order("created_at", { ascending: false }).limit(5),
    ]);

    const revenueToday = sum(settlementsTodayRes.data, "gross_revenue_usd");
    const milesToday = sum(settlementsTodayRes.data, "miles");
    const expensesToday = sum(expensesTodayRes.data, "amount_usd");
    const fuelCostToday = sum(fuelTodayRes.data, "total_cost_usd");

    // 7-day performance buckets (oldest → today).
    const labels: string[] = [];
    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      dayKeys.push(d.toISOString().slice(0, 10));
      labels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    }
    const bucket = (rows: any[] | null, dateCol: string, valCol: string): number[] => {
      const out = new Array(7).fill(0);
      for (const r of rows ?? []) {
        const key = String(r[dateCol] ?? "").slice(0, 10);
        const idx = dayKeys.indexOf(key);
        if (idx >= 0) out[idx] += Number(r[valCol]) || 0;
      }
      return out;
    };
    const revenue7 = bucket(settlements7dRes.data, "settlement_date", "gross_revenue_usd");
    const expenses7 = bucket(expenses7dRes.data, "expense_date", "amount_usd");
    const fuel7 = bucket(fuel7dRes.data, "purchase_date", "total_cost_usd");
    const miles7 = (trips7dRes.data ?? []).reduce((acc: number[], r: any) => {
      const key = String(r.route_date ?? r.completed_at ?? "").slice(0, 10);
      const idx = dayKeys.indexOf(key);
      if (idx >= 0) acc[idx] += Number(r.distance_mi) || 0;
      return acc;
    }, new Array(7).fill(0));
    const profit7 = revenue7.map((r, i) => r - expenses7[i]);

    const activity: HomeDashboardData["activity"] = [];
    for (const l of recentLoadsRes.data ?? []) {
      activity.push({
        text: `Load ${l.bol_number ?? ""} ${l.shipper_name ?? "?"} → ${l.consignee_name ?? "?"} · ${String(l.status).replace(/_/g, " ")}`,
        at: (l as any).created_at ?? "",
      });
    }
    for (const t of recentTripsRes.data ?? []) {
      activity.push({ text: `Trip completed ${t.origin} → ${t.destination}`, at: t.completed_at });
    }
    activity.sort((a, b) => (a.at < b.at ? 1 : -1));

    return {
      companyId,
      fleet: {
        activeTrucks: (trucksRes.data ?? []).length,
        driversOnDuty: new Set((dutyRes.data ?? []).map((r: any) => r.user_id)).size,
        loadsInTransit: transitRes.count ?? 0,
        deliveriesToday: deliveredTodayRes.count ?? 0,
        activeAlerts: alertsRes.count ?? 0,
        pendingInspections: openTasksRes.count ?? 0,
      },
      financial: {
        revenueToday,
        expensesToday,
        profitToday: revenueToday - expensesToday,
        revenuePerMile: milesToday > 0 ? revenueToday / milesToday : null,
        fuelCostToday,
        averageMpg: null, // requires odometer+fuel correlation; show unavailable
        settlementTotal30d: sum(settlements30dRes.data, "gross_revenue_usd"),
        outstandingInvoices: sum(outstandingRes.data, "gross_revenue_usd"),
      },
      performance7d: { labels, revenue: revenue7, expenses: expenses7, profit: profit7, miles: miles7, fuel: fuel7 },
      recentLoads: (recentLoadsRes.data ?? []).map((l: any) => ({
        id: l.id,
        label: `${l.bol_number ?? "Load"} · ${l.shipper_name ?? "?"} → ${l.consignee_name ?? "?"}`,
        status: String(l.status).replace(/_/g, " "),
        rateUsd: l.rate_usd != null ? Number(l.rate_usd) : null,
      })),
      recentSettlements: (recentSettlementsRes.data ?? []).map((s: any) => ({
        id: s.id,
        label: `${s.payer ?? s.customer ?? "Settlement"} · ${s.settlement_date}`,
        amountUsd: Number(s.gross_revenue_usd) || 0,
        status: String(s.status),
      })),
      recentMaintenance: (recentMaintRes.data ?? []).map((m: any) => ({
        id: m.id,
        label: `${m.vehicle_unit ?? "Vehicle"} · ${m.service_type}`,
        detail: m.service_date,
      })),
      activity: activity.slice(0, 5),
      alertsFeed: (alertsFeedRes.data ?? []).map((a: any) => ({
        text: a.message,
        severity: a.severity,
        at: a.created_at,
      })),
    };
  });
