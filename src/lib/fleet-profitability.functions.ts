import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

const RangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type Overview = {
  revenue: number;
  fuel: number;
  maintenance: number;
  driverPay: number;
  otherExpenses: number;
  netProfit: number;
  totalMiles: number;
  profitPerMile: number;
};
export type TruckRow = { truckUnit: string; revenue: number; expenses: number; profit: number; profitPerMile: number; miles: number };
export type LoadRow = { loadId: string; loadNumber: string; customer: string | null; revenue: number; expenses: number; netProfit: number; miles: number; profitPerMile: number };
export type DriverRow = { driverId: string; driverName: string; loadsCompleted: number; revenue: number; cost: number; profitContribution: number };

export type FleetProfitability = {
  range: { from: string | null; to: string | null };
  overview: Overview;
  byTruck: TruckRow[];
  byLoad: LoadRow[];
  byDriver: DriverRow[];
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export const getFleetProfitability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<FleetProfitability> => {
    const supabase = context.supabase;
    const from = data.from ?? null;
    const to = data.to ?? null;

    const dateBetween = <T extends string>(q: any, col: T) => {
      if (from) q = q.gte(col, from);
      if (to) q = q.lte(col, to);
      return q;
    };

    const [settlementsRes, fuelRes, maintRes, expensesRes, loadsRes, profilesRes] = await Promise.all([
      dateBetween(supabase.from("settlements").select("*"), "settlement_date"),
      dateBetween(supabase.from("fuel_purchases").select("*"), "purchase_date"),
      dateBetween(supabase.from("maintenance_records").select("*"), "service_date"),
      dateBetween(supabase.from("expenses").select("*"), "expense_date"),
      supabase.from("loads").select("id,bol_number,shipper_name,consignee_name,rate_usd,total_miles,delivery_at,status,user_id"),
      supabase.from("profiles").select("id,driver_name"),
    ]);

    for (const r of [settlementsRes, fuelRes, maintRes, expensesRes, loadsRes, profilesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const settlements = settlementsRes.data ?? [];
    const fuel = fuelRes.data ?? [];
    const maintenance = maintRes.data ?? [];
    const expenses = expensesRes.data ?? [];
    const loads = loadsRes.data ?? [];
    const profileMap = new Map<string, string>(
      (profilesRes.data ?? []).map((p: any) => [p.id, p.driver_name || "Driver"])
    );

    // -------- Overview --------
    const revenue = settlements.reduce((a: number, s: any) => a + num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd), 0);
    const totalMiles = settlements.reduce((a: number, s: any) => a + num(s.miles), 0);
    const driverPay = settlements.reduce((a: number, s: any) => a + num(s.net_settlement_usd ?? s.gross_pay_usd), 0);
    const fuelCost = fuel.reduce((a: number, f: any) => a + num(f.total_cost_usd), 0);
    const maintCost = maintenance.reduce((a: number, m: any) => a + num(m.cost_usd), 0);
    // Expenses table already includes auto-synced Fuel + Maintenance rows; exclude to avoid double-counting.
    const otherExpenses = expenses
      .filter((e: any) => e.category !== "Fuel" && e.category !== "Maintenance")
      .reduce((a: number, e: any) => a + num(e.amount_usd), 0);
    const totalExpenses = fuelCost + maintCost + driverPay + otherExpenses;
    const netProfit = revenue - totalExpenses;

    const overview: Overview = {
      revenue,
      fuel: fuelCost,
      maintenance: maintCost,
      driverPay,
      otherExpenses,
      netProfit,
      totalMiles,
      profitPerMile: totalMiles > 0 ? netProfit / totalMiles : 0,
    };

    // -------- By Truck --------
    const truckMap = new Map<string, TruckRow>();
    const ensureTruck = (unit: string): TruckRow => {
      const key = unit || "Unassigned";
      let r = truckMap.get(key);
      if (!r) {
        r = { truckUnit: key, revenue: 0, expenses: 0, profit: 0, profitPerMile: 0, miles: 0 };
        truckMap.set(key, r);
      }
      return r;
    };
    for (const s of settlements as any[]) {
      const r = ensureTruck(s.vehicle_unit ?? "Unassigned");
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
      r.miles += num(s.miles);
      r.expenses += num(s.net_settlement_usd ?? s.gross_pay_usd); // driver pay allocated to truck
    }
    for (const f of fuel as any[]) ensureTruck(f.vehicle_unit ?? "Unassigned").expenses += num(f.total_cost_usd);
    for (const m of maintenance as any[]) ensureTruck(m.vehicle_unit ?? "Unassigned").expenses += num(m.cost_usd);
    for (const e of expenses as any[]) {
      if (e.category === "Fuel" || e.category === "Maintenance") continue;
      ensureTruck(e.vehicle_unit ?? "Unassigned").expenses += num(e.amount_usd);
    }
    const byTruck = Array.from(truckMap.values()).map((r) => ({
      ...r,
      profit: r.revenue - r.expenses,
      profitPerMile: r.miles > 0 ? (r.revenue - r.expenses) / r.miles : 0,
    })).sort((a, b) => b.profit - a.profit);

    // -------- By Load --------
    const loadById = new Map<string, any>(loads.map((l: any) => [l.id, l]));
    const loadMap = new Map<string, LoadRow>();
    const ensureLoad = (loadId: string): LoadRow => {
      let r = loadMap.get(loadId);
      if (!r) {
        const l = loadById.get(loadId);
        r = {
          loadId,
          loadNumber: l?.bol_number || loadId.slice(0, 8),
          customer: l?.consignee_name ?? l?.shipper_name ?? null,
          revenue: 0, expenses: 0, netProfit: 0, miles: 0, profitPerMile: 0,
        };
        loadMap.set(loadId, r);
      }
      return r;
    };
    for (const s of settlements as any[]) {
      if (!s.load_id) continue;
      const r = ensureLoad(s.load_id);
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
      r.miles += num(s.miles);
      r.expenses += num(s.net_settlement_usd ?? s.gross_pay_usd);
    }
    for (const f of fuel as any[]) if (f.load_id) ensureLoad(f.load_id).expenses += num(f.total_cost_usd);
    for (const e of expenses as any[]) {
      if (!e.load_id || e.category === "Fuel" || e.category === "Maintenance") continue;
      ensureLoad(e.load_id).expenses += num(e.amount_usd);
    }
    const byLoad = Array.from(loadMap.values()).map((r) => ({
      ...r,
      netProfit: r.revenue - r.expenses,
      profitPerMile: r.miles > 0 ? (r.revenue - r.expenses) / r.miles : 0,
    })).sort((a, b) => b.netProfit - a.netProfit);

    // -------- By Driver --------
    const driverMap = new Map<string, DriverRow>();
    const ensureDriver = (id: string): DriverRow => {
      let r = driverMap.get(id);
      if (!r) {
        r = {
          driverId: id,
          driverName: profileMap.get(id) || "Driver",
          loadsCompleted: 0,
          revenue: 0,
          cost: 0,
          profitContribution: 0,
        };
        driverMap.set(id, r);
      }
      return r;
    };
    const driverLoadSet = new Map<string, Set<string>>();
    for (const s of settlements as any[]) {
      const did = s.driver_id || s.user_id;
      if (!did) continue;
      const r = ensureDriver(did);
      r.revenue += num(s.gross_revenue_usd ?? s.linehaul_revenue_usd ?? s.gross_pay_usd);
      r.cost += num(s.net_settlement_usd ?? s.gross_pay_usd);
      if (s.load_id) {
        if (!driverLoadSet.has(did)) driverLoadSet.set(did, new Set());
        driverLoadSet.get(did)!.add(s.load_id);
      }
    }
    for (const f of fuel as any[]) {
      const did = f.user_id; if (!did) continue;
      ensureDriver(did).cost += num(f.total_cost_usd);
    }
    for (const e of expenses as any[]) {
      if (e.category === "Fuel" || e.category === "Maintenance") continue;
      const did = e.user_id; if (!did) continue;
      ensureDriver(did).cost += num(e.amount_usd);
    }
    for (const [did, set] of driverLoadSet) {
      const r = driverMap.get(did);
      if (r) r.loadsCompleted = set.size;
    }
    const byDriver = Array.from(driverMap.values()).map((r) => ({
      ...r,
      profitContribution: r.revenue - r.cost,
    })).sort((a, b) => b.profitContribution - a.profitContribution);

    return {
      range: { from, to },
      overview,
      byTruck,
      byLoad,
      byDriver,
    };
  });

export const generateProfitabilityInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ insights: string[] }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured");

    // Re-aggregate inline (cheaper than calling the other server fn over RPC).
    const supabase = context.supabase;
    const from = data.from ?? null;
    const to = data.to ?? null;
    const dateBetween = (q: any, col: string) => {
      if (from) q = q.gte(col, from);
      if (to) q = q.lte(col, to);
      return q;
    };
    const [s, f, m, e] = await Promise.all([
      dateBetween(supabase.from("settlements").select("vehicle_unit,driver_id,user_id,gross_revenue_usd,gross_pay_usd,linehaul_revenue_usd,net_settlement_usd,miles,load_id,settlement_date"), "settlement_date"),
      dateBetween(supabase.from("fuel_purchases").select("vehicle_unit,user_id,load_id,total_cost_usd,purchase_date"), "purchase_date"),
      dateBetween(supabase.from("maintenance_records").select("vehicle_unit,cost_usd,service_date"), "service_date"),
      dateBetween(supabase.from("expenses").select("category,amount_usd,vehicle_unit,user_id,load_id,expense_date"), "expense_date"),
    ]);

    const summary = {
      range: { from, to },
      settlements_count: s.data?.length ?? 0,
      revenue: (s.data ?? []).reduce((a: number, x: any) => a + num(x.gross_revenue_usd ?? x.linehaul_revenue_usd ?? x.gross_pay_usd), 0),
      driver_pay: (s.data ?? []).reduce((a: number, x: any) => a + num(x.net_settlement_usd ?? x.gross_pay_usd), 0),
      fuel_cost: (f.data ?? []).reduce((a: number, x: any) => a + num(x.total_cost_usd), 0),
      maint_cost: (m.data ?? []).reduce((a: number, x: any) => a + num(x.cost_usd), 0),
      other_expenses: (e.data ?? []).filter((x: any) => x.category !== "Fuel" && x.category !== "Maintenance").reduce((a: number, x: any) => a + num(x.amount_usd), 0),
      sample_trucks: Array.from(new Set((s.data ?? []).map((x: any) => x.vehicle_unit).filter(Boolean))).slice(0, 10),
    };

    const provider = createLovableAiGatewayProvider(key);
    const model = provider("google/gemini-2.5-flash");

    try {
      const { text } = await generateText({
        model,
        system:
          "You are a trucking fleet financial analyst. Given a JSON summary, return 4-6 short, concrete bullet insights about profitability, costs, and trends. Each bullet ≤140 chars. Use plain numbers (e.g. $12,450 or 14%). Do not include preamble. Return only bullets prefixed with '- '.",
        prompt: `Fleet summary JSON:\n${JSON.stringify(summary, null, 2)}\n\nReturn 4-6 bullets.`,
      });
      const insights = text
        .split("\n")
        .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 6);
      return { insights };
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("429")) throw new Error("AI rate limit reached — try again shortly.");
      if (msg.includes("402")) throw new Error("AI credits exhausted — add credits in Settings → Workspace → Usage.");
      throw new Error("Failed to generate insights");
    }
  });
