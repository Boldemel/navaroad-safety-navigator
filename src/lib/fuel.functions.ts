import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";

export type FuelPurchase = {
  id: string;
  user_id: string;
  purchase_date: string;
  state_code: string;
  station_name: string | null;
  gallons: number;
  price_per_gallon: number;
  total_cost_usd: number;
  odometer: number | null;
  vehicle_unit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const Schema = z.object({
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stateCode: z.string().regex(/^[A-Z]{2}$/),
  stationName: z.string().max(200).nullable().optional(),
  gallons: z.number().min(0).max(500),
  pricePerGallon: z.number().min(0).max(50),
  totalCostUsd: z.number().min(0).max(10_000),
  odometer: z.number().int().min(0).max(5_000_000).nullable().optional(),
  vehicleUnit: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function row(d: z.infer<typeof Schema>) {
  return {
    purchase_date: d.purchaseDate,
    state_code: d.stateCode,
    station_name: d.stationName ?? null,
    gallons: d.gallons,
    price_per_gallon: d.pricePerGallon,
    total_cost_usd: d.totalCostUsd,
    odometer: d.odometer ?? null,
    vehicle_unit: d.vehicleUnit ?? null,
    notes: d.notes ?? null,
  };
}

export const listFuel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fuel_purchases").select("*").order("purchase_date", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return { purchases: (data ?? []) as unknown as FuelPurchase[] };
  });

export const createFuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof Schema>) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase.from("fuel_purchases").insert({ user_id: context.userId, company_id: companyId, ...row(data) });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateFuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & z.infer<typeof Schema>) =>
    z.object({ id: z.string().uuid() }).extend(Schema.shape).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("fuel_purchases").update(row(rest)).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fuel_purchases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
