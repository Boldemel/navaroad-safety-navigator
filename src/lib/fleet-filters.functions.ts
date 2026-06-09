import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FleetFilterOptions = {
  trucks: string[];
  drivers: { id: string; name: string }[];
};

/**
 * Returns the truck list (vehicle_unit values seen across loads/fuel/settlements/maintenance)
 * and driver roster (company members + profile names) for the current user's company.
 * Powers the shared <FleetFilters> dropdowns.
 */
export const listFleetFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FleetFilterOptions> => {
    const supabase = context.supabase;

    const [loadsRes, fuelRes, settleRes, maintRes, membersRes] = await Promise.all([
      supabase.from("loads").select("vehicle_unit").not("vehicle_unit", "is", null),
      supabase.from("fuel_purchases").select("vehicle_unit").not("vehicle_unit", "is", null),
      supabase.from("settlements").select("vehicle_unit").not("vehicle_unit", "is", null),
      supabase.from("maintenance_records").select("vehicle_unit").not("vehicle_unit", "is", null),
      supabase.from("company_members").select("user_id"),
    ]);

    const trucks = new Set<string>();
    for (const r of [loadsRes.data, fuelRes.data, settleRes.data, maintRes.data]) {
      for (const row of (r ?? []) as { vehicle_unit: string | null }[]) {
        if (row.vehicle_unit) trucks.add(row.vehicle_unit);
      }
    }

    const memberIds = Array.from(
      new Set(((membersRes.data ?? []) as { user_id: string }[]).map((m) => m.user_id))
    );
    let drivers: { id: string; name: string }[] = [];
    if (memberIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,driver_name,first_name,last_name")
        .in("id", memberIds);
      drivers = ((profs ?? []) as any[]).map((p) => ({
        id: p.id,
        name:
          p.driver_name ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          "Driver",
      }));
      drivers.sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      trucks: Array.from(trucks).sort(),
      drivers,
    };
  });
