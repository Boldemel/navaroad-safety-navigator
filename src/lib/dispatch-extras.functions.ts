/**
 * Extra Dispatch server functions:
 *   - Truck availability posts (post/list/delete)
 *   - Per-load communication threads
 *   - Dispatch history (completed / cancelled loads with filters)
 *
 * All queries run through the authenticated Supabase client and are
 * company-scoped by RLS. Entitlement is enforced with
 * `assertFeature("dispatch")`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFeature } from "@/lib/fleetos/require-feature.server";
import { getUserCompanyId } from "./get-company";

/* -------------------------------------------------------------------------- */
/* Truck availability posts                                                    */
/* -------------------------------------------------------------------------- */

export type TruckAvailabilityPost = {
  id: string;
  vehicleUnit: string;
  driverId: string | null;
  driverName: string | null;
  availableFrom: string;
  availableTo: string | null;
  originCity: string | null;
  originState: string | null;
  preferredLanes: string | null;
  maxDeadheadMi: number | null;
  equipmentType: string | null;
  trailerType: string | null;
  minRateUsd: number | null;
  minRatePerMile: number | null;
  notes: string | null;
  status: "active" | "booked" | "expired" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

const TruckPostInput = z.object({
  vehicleUnit: z.string().trim().min(1).max(50),
  driverId: z.string().uuid().nullable().optional(),
  availableFrom: z.string().datetime().optional(),
  availableTo: z.string().datetime().nullable().optional(),
  originCity: z.string().trim().max(100).nullable().optional(),
  originState: z.string().trim().max(50).nullable().optional(),
  preferredLanes: z.string().trim().max(400).nullable().optional(),
  maxDeadheadMi: z.number().int().min(0).max(5000).nullable().optional(),
  equipmentType: z.string().trim().max(80).nullable().optional(),
  trailerType: z.string().trim().max(80).nullable().optional(),
  minRateUsd: z.number().min(0).max(1_000_000).nullable().optional(),
  minRatePerMile: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

function mapPost(row: any, driverName: string | null): TruckAvailabilityPost {
  return {
    id: row.id,
    vehicleUnit: row.vehicle_unit,
    driverId: row.driver_id,
    driverName,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    originCity: row.origin_city,
    originState: row.origin_state,
    preferredLanes: row.preferred_lanes,
    maxDeadheadMi: row.max_deadhead_mi,
    equipmentType: row.equipment_type,
    trailerType: row.trailer_type,
    minRateUsd: row.min_rate_usd == null ? null : Number(row.min_rate_usd),
    minRatePerMile:
      row.min_rate_per_mile == null ? null : Number(row.min_rate_per_mile),
    notes: row.notes,
    status: (row.status ?? "active") as TruckAvailabilityPost["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const listTruckAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ posts: TruckAvailabilityPost[] }> => {
    await assertFeature(context, "dispatch");
    const { supabase, userId } = context;
    const companyId = await getUserCompanyId(supabase, userId);
    const { data, error } = await supabase
      .from("truck_availability_posts" as never)
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const driverIds = Array.from(
      new Set(rows.map((r) => r.driver_id).filter(Boolean)),
    ) as string[];
    let names = new Map<string, string>();
    if (driverIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,driver_name,first_name,last_name")
        .in("id", driverIds);
      for (const p of (profs ?? []) as any[]) {
        names.set(
          p.id,
          p.driver_name ||
            [p.first_name, p.last_name].filter(Boolean).join(" ") ||
            "Driver",
        );
      }
    }
    return { posts: rows.map((r) => mapPost(r, names.get(r.driver_id) ?? null)) };
  });

export const createTruckAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TruckPostInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "dispatch", { requireWritable: true });
    const { supabase, userId } = context;
    const companyId = await getUserCompanyId(supabase, userId);
    const insert = {
      company_id: companyId,
      user_id: userId,
      vehicle_unit: data.vehicleUnit,
      driver_id: data.driverId ?? null,
      available_from: data.availableFrom ?? new Date().toISOString(),
      available_to: data.availableTo ?? null,
      origin_city: data.originCity ?? null,
      origin_state: data.originState ?? null,
      preferred_lanes: data.preferredLanes ?? null,
      max_deadhead_mi: data.maxDeadheadMi ?? null,
      equipment_type: data.equipmentType ?? null,
      trailer_type: data.trailerType ?? null,
      min_rate_usd: data.minRateUsd ?? null,
      min_rate_per_mile: data.minRatePerMile ?? null,
      notes: data.notes ?? null,
    };
    const { data: row, error } = await supabase
      .from("truck_availability_posts" as never)
      .insert(insert as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { post: mapPost(row, null) };
  });

export const updateTruckAvailabilityStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "booked", "expired", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFeature(context, "dispatch", { requireWritable: true });
    const { error } = await context.supabase
      .from("truck_availability_posts" as never)
      .update({ status: data.status } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTruckAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFeature(context, "dispatch", { requireWritable: true });
    const { error } = await context.supabase
      .from("truck_availability_posts" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Dispatch communications                                                     */
/* -------------------------------------------------------------------------- */

export type DispatchMessage = {
  id: string;
  loadId: string;
  authorId: string;
  authorName: string | null;
  channel: string;
  body: string;
  createdAt: string;
};

export const listLoadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ loadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ messages: DispatchMessage[] }> => {
    await assertFeature(context, "dispatch");
    const { data: rows, error } = await context.supabase
      .from("dispatch_communications" as never)
      .select("*")
      .eq("load_id", data.loadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return {
      messages: ((rows ?? []) as any[]).map((r) => ({
        id: r.id,
        loadId: r.load_id,
        authorId: r.author_id,
        authorName: r.author_name,
        channel: r.channel,
        body: r.body,
        createdAt: r.created_at,
      })),
    };
  });

export const postLoadMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loadId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
        channel: z.enum(["note", "driver", "customer"]).default("note"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFeature(context, "dispatch", { requireWritable: true });
    const { supabase, userId } = context;
    const companyId = await getUserCompanyId(supabase, userId);
    const { data: prof } = await supabase
      .from("profiles")
      .select("driver_name,first_name,last_name")
      .eq("id", userId)
      .maybeSingle();
    const authorName =
      (prof as any)?.driver_name ||
      [(prof as any)?.first_name, (prof as any)?.last_name]
        .filter(Boolean)
        .join(" ") ||
      null;
    const { data: row, error } = await supabase
      .from("dispatch_communications" as never)
      .insert({
        company_id: companyId,
        load_id: data.loadId,
        author_id: userId,
        author_name: authorName,
        channel: data.channel,
        body: data.body,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { message: row };
  });

export const deleteLoadMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFeature(context, "dispatch", { requireWritable: true });
    const { error } = await context.supabase
      .from("dispatch_communications" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Dispatch history (completed / cancelled)                                    */
/* -------------------------------------------------------------------------- */

export type DispatchHistoryRow = {
  id: string;
  bolNumber: string | null;
  commodity: string | null;
  shipperName: string | null;
  consigneeName: string | null;
  deliveryAt: string | null;
  completedAt: string | null;
  driverId: string | null;
  driverName: string | null;
  vehicleUnit: string | null;
  rateUsd: number | null;
  totalMiles: number | null;
  dispatchStatus: string;
  updatedAt: string;
};

const HistoryFilters = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["all", "completed", "delivered", "cancelled"]).default("all"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  driverId: z.string().uuid().optional(),
  vehicleUnit: z.string().trim().max(50).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listDispatchHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HistoryFilters.parse(d ?? {}))
  .handler(
    async ({ data, context }): Promise<{ history: DispatchHistoryRow[] }> => {
      await assertFeature(context, "dispatch");
      const { supabase, userId } = context;
      const companyId = await getUserCompanyId(supabase, userId);
      let q = supabase
        .from("loads")
        .select(
          "id,bol_number,commodity,shipper_name,consignee_name,delivery_at,completed_at,driver_id,vehicle_unit,rate_usd,total_miles,dispatch_status,updated_at",
        )
        .eq("company_id", companyId);
      if (data.status === "all") {
        q = q.in("dispatch_status", ["delivered", "completed", "cancelled"]);
      } else {
        q = q.eq("dispatch_status", data.status);
      }
      if (data.driverId) q = q.eq("driver_id", data.driverId);
      if (data.vehicleUnit) q = q.eq("vehicle_unit", data.vehicleUnit);
      if (data.from) q = q.gte("updated_at", `${data.from}T00:00:00Z`);
      if (data.to) q = q.lte("updated_at", `${data.to}T23:59:59Z`);
      if (data.search) {
        const s = data.search.replace(/[%_]/g, "");
        q = q.or(
          `bol_number.ilike.%${s}%,commodity.ilike.%${s}%,shipper_name.ilike.%${s}%,consignee_name.ilike.%${s}%,vehicle_unit.ilike.%${s}%`,
        );
      }
      const { data: rows, error } = await q
        .order("updated_at", { ascending: false })
        .limit(data.limit);
      if (error) throw new Error(error.message);

      const driverIds = Array.from(
        new Set(((rows ?? []) as any[]).map((r) => r.driver_id).filter(Boolean)),
      ) as string[];
      const names = new Map<string, string>();
      if (driverIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,driver_name,first_name,last_name")
          .in("id", driverIds);
        for (const p of (profs ?? []) as any[]) {
          names.set(
            p.id,
            p.driver_name ||
              [p.first_name, p.last_name].filter(Boolean).join(" ") ||
              "Driver",
          );
        }
      }
      return {
        history: ((rows ?? []) as any[]).map((r) => ({
          id: r.id,
          bolNumber: r.bol_number,
          commodity: r.commodity,
          shipperName: r.shipper_name,
          consigneeName: r.consignee_name,
          deliveryAt: r.delivery_at,
          completedAt: r.completed_at,
          driverId: r.driver_id,
          driverName: r.driver_id ? names.get(r.driver_id) ?? null : null,
          vehicleUnit: r.vehicle_unit,
          rateUsd: r.rate_usd == null ? null : Number(r.rate_usd),
          totalMiles: r.total_miles == null ? null : Number(r.total_miles),
          dispatchStatus: r.dispatch_status ?? "",
          updatedAt: r.updated_at,
        })),
      };
    },
  );
