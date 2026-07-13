import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";
import { assertFeature } from "@/lib/fleetos/require-feature.server";

export type IftaEntry = {
  id: string;
  user_id: string;
  trip_log_id: string | null;
  entry_date: string;
  state_code: string;
  miles: number;
  fuel_gallons: number;
  fuel_cost_usd: number | null;
  notes: string | null;
  created_at: string;
};

const EntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stateCode: z.string().min(2).max(3).regex(/^[A-Z]+$/),
  miles: z.number().min(0).max(10_000),
  fuelGallons: z.number().min(0).max(1_000),
  fuelCostUsd: z.number().min(0).max(10_000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const listIfta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFeature(context, "ifta");
    const { data, error } = await context.supabase
      .from("ifta_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { entries: (data ?? []) as unknown as IftaEntry[] };
  });

export const createIfta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof EntrySchema>) => EntrySchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "ifta", { requireWritable: true });
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase.from("ifta_entries").insert({
      user_id: context.userId,
      company_id: companyId,
      entry_date: data.entryDate,
      state_code: data.stateCode.toUpperCase(),
      miles: data.miles,
      fuel_gallons: data.fuelGallons,
      fuel_cost_usd: data.fuelCostUsd ?? null,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteIfta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "ifta", { requireWritable: true });
    const { error } = await context.supabase.from("ifta_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
