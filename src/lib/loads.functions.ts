import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";
import { assertFeature } from "@/lib/fleetos/require-feature.server";

export type Load = {
  id: string;
  user_id: string;
  status: "planned" | "in_transit" | "delivered" | "cancelled";
  bol_number: string | null;
  commodity: string | null;
  weight_lbs: number | null;
  shipper_name: string | null;
  shipper_address: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  pickup_at: string | null;
  delivery_at: string | null;
  rate_usd: number | null;
  notes: string | null;
  is_current: boolean;
  loaded_miles: number | null;
  empty_miles: number | null;
  total_miles: number | null;
  created_at: string;
  updated_at: string;
};

const LoadSchema = z.object({
  status: z.enum(["planned", "in_transit", "delivered", "cancelled"]).default("planned"),
  bolNumber: z.string().max(80).nullable().optional(),
  commodity: z.string().max(200).nullable().optional(),
  weightLbs: z.number().min(0).max(200_000).nullable().optional(),
  shipperName: z.string().max(200).nullable().optional(),
  shipperAddress: z.string().max(400).nullable().optional(),
  consigneeName: z.string().max(200).nullable().optional(),
  consigneeAddress: z.string().max(400).nullable().optional(),
  pickupAt: z.string().datetime().nullable().optional(),
  deliveryAt: z.string().datetime().nullable().optional(),
  rateUsd: z.number().min(0).max(1_000_000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isCurrent: z.boolean().default(false),
  loadedMiles: z.number().min(0).max(50_000).nullable().optional(),
  emptyMiles: z.number().min(0).max(50_000).nullable().optional(),
  totalMiles: z.number().min(0).max(50_000).nullable().optional(),
});

function rowFromInput(d: z.infer<typeof LoadSchema>) {
  return {
    status: d.status,
    bol_number: d.bolNumber ?? null,
    commodity: d.commodity ?? null,
    weight_lbs: d.weightLbs ?? null,
    shipper_name: d.shipperName ?? null,
    shipper_address: d.shipperAddress ?? null,
    consignee_name: d.consigneeName ?? null,
    consignee_address: d.consigneeAddress ?? null,
    pickup_at: d.pickupAt ?? null,
    delivery_at: d.deliveryAt ?? null,
    rate_usd: d.rateUsd ?? null,
    notes: d.notes ?? null,
    is_current: d.isCurrent,
    loaded_miles: d.loadedMiles ?? null,
    empty_miles: d.emptyMiles ?? null,
    total_miles: d.totalMiles ?? null,
  };
}

export const createLoad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof LoadSchema>) => LoadSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "loads", { requireWritable: true });
    const { supabase, userId } = context;
    const companyId = await getUserCompanyId(supabase, userId);
    if (data.isCurrent) {
      await supabase.from("loads").update({ is_current: false }).eq("user_id", userId).eq("is_current", true);
    }
    const { data: row, error } = await supabase
      .from("loads")
      .insert({ user_id: userId, company_id: companyId, ...rowFromInput(data) })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { load: row as unknown as Load };
  });

export const updateLoad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string } & z.infer<typeof LoadSchema>) =>
    z.object({ id: z.string().uuid() }).extend(LoadSchema.shape).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertFeature(context, "loads", { requireWritable: true });
    const { supabase, userId } = context;
    const { id, ...rest } = data;
    if (rest.isCurrent) {
      await supabase.from("loads").update({ is_current: false }).eq("user_id", userId).eq("is_current", true).neq("id", id);
    }
    const { data: row, error } = await supabase
      .from("loads")
      .update(rowFromInput(rest))
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { load: row as unknown as Load };
  });

export const listLoads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFeature(context, "loads");
    const { data, error } = await context.supabase
      .from("loads")
      .select("*")
      .order("is_current", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { loads: (data ?? []) as unknown as Load[] };
  });

export const deleteLoad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "loads", { requireWritable: true });
    const { error } = await context.supabase.from("loads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
