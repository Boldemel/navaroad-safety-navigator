import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";

export type Expense = {
  id: string;
  user_id: string;
  expense_date: string;
  category: string;
  amount_usd: number;
  vendor: string | null;
  state_code: string | null;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
};

export const EXPENSE_CATEGORIES = [
  "Fuel","Meals","Tolls","Parking","Lumper","Scale","Repairs","Supplies","Lodging","Permits","Other",
] as const;

const Schema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(EXPENSE_CATEGORIES),
  amountUsd: z.number().min(0).max(1_000_000),
  vendor: z.string().max(200).nullable().optional(),
  stateCode: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function row(d: z.infer<typeof Schema>) {
  return {
    expense_date: d.expenseDate,
    category: d.category,
    amount_usd: d.amountUsd,
    vendor: d.vendor ?? null,
    state_code: d.stateCode ?? null,
    notes: d.notes ?? null,
  };
}

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("expenses").select("*").order("expense_date", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return { expenses: (data ?? []) as unknown as Expense[] };
  });

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof Schema>) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expenses").insert({ user_id: context.userId, ...row(data) });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & z.infer<typeof Schema>) =>
    z.object({ id: z.string().uuid() }).extend(Schema.shape).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("expenses").update(row(rest)).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
