/**
 * Dispatch module server functions.
 *
 * Powers the Dispatch Dashboard, the driver/truck assignment interface,
 * and the trip-status timeline. Entitlement is enforced via
 * `assertFeature("dispatch", …)` and writes require an active
 * subscription.
 *
 * All queries are company-scoped through the authenticated Supabase
 * client (RLS). No admin client is used.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFeature } from "@/lib/fleetos/require-feature.server";
import { getUserCompanyId } from "./get-company";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export const DISPATCH_STATUSES = [
  "unassigned",
  "assigned",
  "accepted",
  "driving_to_pickup",
  "loaded",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

/** Ordered milestones shown on the trip timeline (cancelled is a side-state). */
export const TIMELINE_STEPS: DispatchStatus[] = [
  "assigned",
  "accepted",
  "driving_to_pickup",
  "loaded",
  "in_transit",
  "delivered",
  "completed",
];

export type DispatchLoad = {
  id: string;
  bolNumber: string | null;
  commodity: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  pickupAt: string | null;
  deliveryAt: string | null;
  rateUsd: number | null;
  totalMiles: number | null;
  driverId: string | null;
  driverName: string | null;
  vehicleUnit: string | null;
  dispatchStatus: DispatchStatus;
  assignedAt: string | null;
  acceptedAt: string | null;
  pickupArrivedAt: string | null;
  loadedAt: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type DispatchDriver = {
  userId: string;
  memberId: string;
  name: string;
  phone: string | null;
  assignedTruck: string | null;
  status: "available" | "in_transit" | "waiting" | "off_duty";
  activeLoadId: string | null;
};

export type DispatchTruck = {
  vehicleUnit: string;
  driverId: string | null;
  driverName: string | null;
  status: "available" | "in_use";
  activeLoadId: string | null;
};

export type DispatchOverview = {
  activeLoads: number;
  unassignedLoads: number;
  availableDrivers: number;
  availableTrucks: number;
  driversInTransit: number;
  driversWaiting: number;
  deliveriesDueToday: number;
  weatherAlerts: number;
  aiRecommendations: number;
};

export type DispatchSnapshot = {
  overview: DispatchOverview;
  loads: DispatchLoad[];
  drivers: DispatchDriver[];
  trucks: DispatchTruck[];
  recommendations: AiRecommendation[];
  weather: WeatherAlert[];
};

export type AiRecommendation = {
  id: string;
  kind: "assign" | "reroute" | "hos_risk" | "profitability";
  title: string;
  detail: string;
  loadId?: string | null;
  driverId?: string | null;
  vehicleUnit?: string | null;
};

export type WeatherAlert = {
  id: string;
  region: string;
  severity: "info" | "watch" | "warning";
  message: string;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

type ProfileRow = {
  id: string;
  driver_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  assigned_truck: string | null;
  active: boolean | null;
};

function profileName(p: ProfileRow | undefined): string {
  if (!p) return "Driver";
  return (
    p.driver_name ||
    [p.first_name, p.last_name].filter(Boolean).join(" ") ||
    "Driver"
  );
}

function mapLoad(row: any, driverName: string | null): DispatchLoad {
  return {
    id: row.id,
    bolNumber: row.bol_number,
    commodity: row.commodity,
    shipperName: row.shipper_name,
    shipperAddress: row.shipper_address,
    consigneeName: row.consignee_name,
    consigneeAddress: row.consignee_address,
    pickupAt: row.pickup_at,
    deliveryAt: row.delivery_at,
    rateUsd: row.rate_usd == null ? null : Number(row.rate_usd),
    totalMiles: row.total_miles == null ? null : Number(row.total_miles),
    driverId: row.driver_id,
    driverName,
    vehicleUnit: row.vehicle_unit,
    dispatchStatus: (row.dispatch_status ?? "unassigned") as DispatchStatus,
    assignedAt: row.assigned_at,
    acceptedAt: row.accepted_at,
    pickupArrivedAt: row.pickup_arrived_at,
    loadedAt: row.loaded_at,
    inTransitAt: row.in_transit_at,
    deliveredAt: row.delivered_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

const ACTIVE_STATUSES: DispatchStatus[] = [
  "assigned",
  "accepted",
  "driving_to_pickup",
  "loaded",
  "in_transit",
];

function isActive(s: DispatchStatus) {
  return ACTIVE_STATUSES.includes(s);
}

function sameDay(iso: string | null, day: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

/* -------------------------------------------------------------------------- */
/* Read: dispatch snapshot                                                     */
/* -------------------------------------------------------------------------- */

export const getDispatchSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DispatchSnapshot> => {
    await assertFeature(context, "dispatch");
    const { supabase, userId } = context;
    const companyId = await getUserCompanyId(supabase, userId);

    // Loads (all recent, so we can group unassigned / active / due-today)
    const { data: loadRows, error: loadErr } = await supabase
      .from("loads")
      .select(
        "id,bol_number,commodity,shipper_name,shipper_address,consignee_name,consignee_address,pickup_at,delivery_at,rate_usd,total_miles,driver_id,vehicle_unit,dispatch_status,assigned_at,accepted_at,pickup_arrived_at,loaded_at,in_transit_at,delivered_at,completed_at,updated_at,status",
      )
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(300);
    if (loadErr) throw new Error(loadErr.message);

    // Members + roles → drivers only
    const { data: memberRows, error: memErr } = await supabase
      .from("company_members")
      .select("id,user_id")
      .eq("company_id", companyId);
    if (memErr) throw new Error(memErr.message);
    const memberIds = (memberRows ?? []).map((m) => m.id);
    const userIds = (memberRows ?? []).map((m) => m.user_id);

    const [rolesRes, profilesRes] = await Promise.all([
      memberIds.length
        ? supabase
            .from("company_member_roles")
            .select("member_id,role")
            .in("member_id", memberIds)
        : Promise.resolve({ data: [], error: null } as const),
      userIds.length
        ? supabase
            .from("profiles")
            .select(
              "id,driver_name,first_name,last_name,phone,assigned_truck,active",
            )
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const profileMap = new Map<string, ProfileRow>();
    for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
      profileMap.set(p.id, p);
    }

    const driverMemberIds = new Set(
      (rolesRes.data ?? [])
        .filter((r: any) => r.role === "driver")
        .map((r: any) => r.member_id as string),
    );

    // Loads mapped with driver names
    const loads: DispatchLoad[] = (loadRows ?? []).map((row: any) =>
      mapLoad(row, profileName(profileMap.get(row.driver_id ?? ""))),
    );

    // Driver active-load index
    const driverActiveLoad = new Map<string, DispatchLoad>();
    for (const l of loads) {
      if (l.driverId && isActive(l.dispatchStatus)) {
        const cur = driverActiveLoad.get(l.driverId);
        if (!cur || new Date(l.updatedAt) > new Date(cur.updatedAt)) {
          driverActiveLoad.set(l.driverId, l);
        }
      }
    }

    // Drivers
    const drivers: DispatchDriver[] = (memberRows ?? [])
      .filter((m) => driverMemberIds.has(m.id))
      .map((m) => {
        const p = profileMap.get(m.user_id);
        const active = driverActiveLoad.get(m.user_id);
        let status: DispatchDriver["status"] = "available";
        if (!p?.active) status = "off_duty";
        else if (active) {
          status =
            active.dispatchStatus === "loaded" ||
            active.dispatchStatus === "driving_to_pickup"
              ? "waiting"
              : "in_transit";
        }
        return {
          userId: m.user_id,
          memberId: m.id,
          name: profileName(p),
          phone: p?.phone ?? null,
          assignedTruck: p?.assigned_truck ?? null,
          status,
          activeLoadId: active?.id ?? null,
        };
      });

    // Trucks (derived from profiles + active loads' vehicle_unit)
    const truckSet = new Map<string, DispatchTruck>();
    for (const d of drivers) {
      if (d.assignedTruck) {
        truckSet.set(d.assignedTruck, {
          vehicleUnit: d.assignedTruck,
          driverId: d.userId,
          driverName: d.name,
          status: d.status === "available" ? "available" : "in_use",
          activeLoadId: d.activeLoadId,
        });
      }
    }
    for (const l of loads) {
      if (l.vehicleUnit && !truckSet.has(l.vehicleUnit)) {
        truckSet.set(l.vehicleUnit, {
          vehicleUnit: l.vehicleUnit,
          driverId: l.driverId,
          driverName: l.driverName,
          status: isActive(l.dispatchStatus) ? "in_use" : "available",
          activeLoadId: isActive(l.dispatchStatus) ? l.id : null,
        });
      }
    }
    const trucks = Array.from(truckSet.values()).sort((a, b) =>
      a.vehicleUnit.localeCompare(b.vehicleUnit),
    );

    // Overview counters
    const today = new Date();
    const overview: DispatchOverview = {
      activeLoads: loads.filter((l) => isActive(l.dispatchStatus)).length,
      unassignedLoads: loads.filter(
        (l) => l.dispatchStatus === "unassigned" && !l.driverId,
      ).length,
      availableDrivers: drivers.filter((d) => d.status === "available").length,
      availableTrucks: trucks.filter((t) => t.status === "available").length,
      driversInTransit: drivers.filter((d) => d.status === "in_transit").length,
      driversWaiting: drivers.filter((d) => d.status === "waiting").length,
      deliveriesDueToday: loads.filter(
        (l) => isActive(l.dispatchStatus) && sameDay(l.deliveryAt, today),
      ).length,
      weatherAlerts: 0,
      aiRecommendations: 0,
    };

    // Heuristic AI recommendations (L1). The dispatcher assistant panel
    // hands over to the LLM for open-ended questions; these are the
    // always-visible surface hints.
    const recommendations: AiRecommendation[] = [];
    const unassigned = loads.filter(
      (l) => l.dispatchStatus === "unassigned" && !l.driverId,
    );
    for (const l of unassigned.slice(0, 3)) {
      const candidate = drivers.find((d) => d.status === "available");
      if (candidate) {
        recommendations.push({
          id: `rec-assign-${l.id}`,
          kind: "assign",
          title: `Assign ${candidate.name} to ${l.bolNumber ?? l.commodity ?? "load"}`,
          detail: `${candidate.name} is available${candidate.assignedTruck ? ` (Truck ${candidate.assignedTruck})` : ""}. Pickup ${l.shipperName ?? "TBD"} → ${l.consigneeName ?? "TBD"}.`,
          loadId: l.id,
          driverId: candidate.userId,
          vehicleUnit: candidate.assignedTruck,
        });
      }
    }
    const dueToday = loads.filter(
      (l) => isActive(l.dispatchStatus) && sameDay(l.deliveryAt, today),
    );
    if (dueToday.length >= 3) {
      recommendations.push({
        id: "rec-due-today",
        kind: "hos_risk",
        title: `${dueToday.length} deliveries due today — review HOS`,
        detail:
          "Check each assigned driver's remaining drive and shift time before dispatching more work.",
      });
    }
    const bestProfit = [...unassigned]
      .filter((l) => l.rateUsd != null && l.totalMiles && l.totalMiles > 0)
      .sort(
        (a, b) =>
          (b.rateUsd ?? 0) / (b.totalMiles || 1) -
          (a.rateUsd ?? 0) / (a.totalMiles || 1),
      )[0];
    if (bestProfit) {
      recommendations.push({
        id: `rec-profit-${bestProfit.id}`,
        kind: "profitability",
        title: `Most profitable open load: ${bestProfit.bolNumber ?? bestProfit.commodity ?? "load"}`,
        detail: `$${(bestProfit.rateUsd ?? 0).toFixed(0)} / ${bestProfit.totalMiles} mi ≈ $${(((bestProfit.rateUsd ?? 0) / (bestProfit.totalMiles || 1)) * 1).toFixed(2)}/mi`,
        loadId: bestProfit.id,
      });
    }

    overview.aiRecommendations = recommendations.length;

    // Weather is wired through a dedicated service; expose an empty slot so
    // the dashboard renders the section without a special-case null check.
    const weather: WeatherAlert[] = [];
    overview.weatherAlerts = weather.length;

    return { overview, loads, drivers, trucks, recommendations, weather };
  });

/* -------------------------------------------------------------------------- */
/* Write: assignment + status transitions                                      */
/* -------------------------------------------------------------------------- */

const AssignSchema = z.object({
  loadId: z.string().uuid(),
  driverId: z.string().uuid().nullable().optional(),
  vehicleUnit: z.string().max(50).nullable().optional(),
});

export const assignLoad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "dispatch", { requireWritable: true });
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      driver_id: data.driverId ?? null,
      vehicle_unit: data.vehicleUnit ?? null,
    };
    if (data.driverId) {
      patch.dispatch_status = "assigned";
      patch.assigned_at = nowIso;
    } else {
      patch.dispatch_status = "unassigned";
      patch.assigned_at = null;
    }
    const { data: row, error } = await context.supabase
      .from("loads")
      .update(patch)
      .eq("id", data.loadId)
      .select("id,dispatch_status,driver_id,vehicle_unit,assigned_at")
      .single();
    if (error) throw new Error(error.message);
    return { load: row };
  });

const StatusSchema = z.object({
  loadId: z.string().uuid(),
  dispatchStatus: z.enum(DISPATCH_STATUSES),
});

export const updateDispatchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "dispatch", { requireWritable: true });
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { dispatch_status: data.dispatchStatus };
    // Stamp the milestone timestamp on the transition
    switch (data.dispatchStatus) {
      case "assigned":
        patch.assigned_at = nowIso;
        break;
      case "accepted":
        patch.accepted_at = nowIso;
        break;
      case "driving_to_pickup":
        patch.pickup_arrived_at = null;
        break;
      case "loaded":
        patch.loaded_at = nowIso;
        break;
      case "in_transit":
        patch.in_transit_at = nowIso;
        patch.status = "in_transit";
        break;
      case "delivered":
        patch.delivered_at = nowIso;
        patch.status = "delivered";
        break;
      case "completed":
        patch.completed_at = nowIso;
        patch.status = "delivered";
        break;
      case "cancelled":
        patch.status = "cancelled";
        break;
    }
    const { data: row, error } = await context.supabase
      .from("loads")
      .update(patch)
      .eq("id", data.loadId)
      .select("id,dispatch_status")
      .single();
    if (error) throw new Error(error.message);
    return { load: row };
  });
