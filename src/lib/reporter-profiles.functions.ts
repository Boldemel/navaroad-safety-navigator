import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ReporterProfile = {
  driver_name: string;
  totalReports: number;
  confirmedReports: number;
  tier: "trusted" | "active" | "new";
};

/**
 * Public, narrow projection of driver reputation. Returns only
 * driver_name (already shown across the app) and aggregated counts of
 * their hazard reports — no email, phone, or truck details.
 */
export const getReporterProfiles = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ userIds: z.array(z.string().uuid()).min(0).max(200) }).parse(input),
  )
  .handler(async ({ data }): Promise<Record<string, ReporterProfile>> => {
    if (data.userIds.length === 0) return {};
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = Array.from(new Set(data.userIds));

    const [profilesRes, reportsRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, driver_name").in("id", ids),
      supabaseAdmin
        .from("hazard_reports")
        .select("reporter_id, confirm_count, dispute_count, status")
        .in("reporter_id", ids),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (reportsRes.error) throw reportsRes.error;

    const out: Record<string, ReporterProfile> = {};
    for (const id of ids) {
      out[id] = { driver_name: "Driver", totalReports: 0, confirmedReports: 0, tier: "new" };
    }
    for (const p of profilesRes.data ?? []) {
      if (out[p.id]) out[p.id].driver_name = p.driver_name ?? "Driver";
    }
    for (const r of reportsRes.data ?? []) {
      const slot = r.reporter_id ? out[r.reporter_id] : undefined;
      if (!slot) continue;
      slot.totalReports += 1;
      const isConfirmed =
        (r.confirm_count ?? 0) >= 2 &&
        (r.confirm_count ?? 0) > (r.dispute_count ?? 0) &&
        r.status !== "disputed";
      if (isConfirmed) slot.confirmedReports += 1;
    }
    for (const id of ids) {
      const p = out[id];
      p.tier = p.confirmedReports >= 5 ? "trusted" : p.totalReports >= 3 ? "active" : "new";
    }
    return out;
  });
