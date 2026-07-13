import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";
import { assertFeature } from "@/lib/fleetos/require-feature.server";

export type Settlement = {
  id: string;
  user_id: string;
  load_id: string | null;
  settlement_date: string;
  gross_pay_usd: number;
  miles: number | null;
  rate_per_mile: number | null;
  deductions_usd: number;
  deduction_notes: string | null;
  payer: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const Schema = z.object({
  loadId: z.string().uuid().nullable().optional(),
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grossPayUsd: z.number().min(0).max(10_000_000),
  miles: z.number().min(0).max(100_000).nullable().optional(),
  ratePerMile: z.number().min(0).max(100).nullable().optional(),
  deductionsUsd: z.number().min(0).max(10_000_000),
  deductionNotes: z.string().max(2000).nullable().optional(),
  payer: z.string().max(200).nullable().optional(),
  referenceNumber: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function row(d: z.infer<typeof Schema>) {
  return {
    load_id: d.loadId ?? null,
    settlement_date: d.settlementDate,
    gross_pay_usd: d.grossPayUsd,
    miles: d.miles ?? null,
    rate_per_mile: d.ratePerMile ?? null,
    deductions_usd: d.deductionsUsd,
    deduction_notes: d.deductionNotes ?? null,
    payer: d.payer ?? null,
    reference_number: d.referenceNumber ?? null,
    notes: d.notes ?? null,
  };
}

export const listSettlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFeature(context, "settlements");
    const { data, error } = await context.supabase
      .from("settlements").select("*").order("settlement_date", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return { settlements: (data ?? []) as unknown as Settlement[] };
  });

export const createSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof Schema>) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "settlements", { requireWritable: true });
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase.from("settlements").insert({ user_id: context.userId, company_id: companyId, ...row(data) });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & z.infer<typeof Schema>) =>
    z.object({ id: z.string().uuid() }).extend(Schema.shape).parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "settlements", { requireWritable: true });
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("settlements").update(row(rest)).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "settlements", { requireWritable: true });
    const { error } = await context.supabase.from("settlements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
