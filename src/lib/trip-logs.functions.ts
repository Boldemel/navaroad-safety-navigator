import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";

export type StateMileage = { state: string; miles: number; gallons?: number };

export type TripLog = {
  id: string;
  user_id: string;
  company_id: string;
  load_id: string | null;
  origin: string;
  destination: string;
  distance_mi: number | null;
  duration_min: number | null;
  truck_type: string | null;
  trailer_type: string | null;
  vehicle_unit: string | null;
  route_date: string | null;
  state_mileage: StateMileage[] | null;
  safety_score: number | null;
  hazard_count: number | null;
  weather_alerts: number | null;
  fuel_cost: number | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string;
  created_at: string;
};

const StateMileageSchema = z
  .array(
    z.object({
      state: z.string().min(2).max(3).regex(/^[A-Za-z]+$/),
      miles: z.number().min(0).max(20000),
      gallons: z.number().min(0).max(2000).optional(),
    }),
  )
  .max(60)
  .optional()
  .nullable();

const InsertSchema = z.object({
  origin: z.string().min(1).max(300),
  destination: z.string().min(1).max(300),
  distanceMi: z.number().min(0).max(20000).nullable().optional(),
  durationMin: z.number().min(0).max(20000).nullable().optional(),
  truckType: z.string().max(60).nullable().optional(),
  trailerType: z.string().max(60).nullable().optional(),
  vehicleUnit: z.string().max(60).nullable().optional(),
  routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  loadId: z.string().uuid().nullable().optional(),
  stateMileage: StateMileageSchema,
  safetyScore: z.number().int().min(0).max(100).nullable().optional(),
  hazardCount: z.number().int().min(0).max(10000).nullable().optional(),
  weatherAlerts: z.number().int().min(0).max(10000).nullable().optional(),
  fuelCost: z.number().min(0).max(100000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
});

export const logTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof InsertSchema>) => InsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getUserCompanyId(supabase, userId);

    // If a load_id is provided, verify it belongs to the same company (RLS would
    // also catch this, but we want a clearer error).
    if (data.loadId) {
      const { data: load, error: loadErr } = await supabase
        .from("loads")
        .select("id,company_id")
        .eq("id", data.loadId)
        .maybeSingle();
      if (loadErr) throw new Error(loadErr.message);
      if (!load || load.company_id !== companyId) {
        throw new Error("Load not found in your company");
      }
    }

    const normalizedStates = data.stateMileage
      ? data.stateMileage
          .map((s) => ({ state: s.state.toUpperCase(), miles: s.miles, gallons: s.gallons ?? 0 }))
          .filter((s) => s.miles > 0)
      : null;

    const { data: row, error } = await supabase
      .from("trip_logs")
      .insert({
        user_id: userId,
        company_id: companyId,
        load_id: data.loadId ?? null,
        origin: data.origin,
        destination: data.destination,
        distance_mi: data.distanceMi ?? null,
        duration_min: data.durationMin ?? null,
        truck_type: data.truckType ?? null,
        trailer_type: data.trailerType ?? null,
        vehicle_unit: data.vehicleUnit ?? null,
        route_date: data.routeDate ?? null,
        state_mileage: normalizedStates,
        safety_score: data.safetyScore ?? null,
        hazard_count: data.hazardCount ?? null,
        weather_alerts: data.weatherAlerts ?? null,
        fuel_cost: data.fuelCost ?? null,
        notes: data.notes ?? null,
        started_at: data.startedAt ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { trip: row as unknown as TripLog };
  });

export const listTrips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("trip_logs")
      .select("*")
      .order("completed_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { trips: (data ?? []) as unknown as TripLog[] };
  });

export const deleteTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("trip_logs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
