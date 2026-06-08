import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MaintRecord = {
  id: string;
  user_id: string;
  vehicle_unit: string | null;
  service_type: string;
  service_date: string;
  odometer: number | null;
  cost_usd: number | null;
  vendor: string | null;
  notes: string | null;
  next_due_date: string | null;
  next_due_odometer: number | null;
  created_at: string;
  updated_at: string;
};

const MaintSchema = z.object({
  vehicleUnit: z.string().max(40).nullable().optional(),
  serviceType: z.string().min(1).max(80),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  odometer: z.number().int().min(0).max(5_000_000).nullable().optional(),
  costUsd: z.number().min(0).max(100_000).nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  nextDueOdometer: z.number().int().min(0).max(5_000_000).nullable().optional(),
});

function row(d: z.infer<typeof MaintSchema>) {
  return {
    vehicle_unit: d.vehicleUnit ?? null,
    service_type: d.serviceType,
    service_date: d.serviceDate,
    odometer: d.odometer ?? null,
    cost_usd: d.costUsd ?? null,
    vendor: d.vendor ?? null,
    notes: d.notes ?? null,
    next_due_date: d.nextDueDate ?? null,
    next_due_odometer: d.nextDueOdometer ?? null,
  };
}

export const listMaintenance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("maintenance_records")
      .select("*")
      .order("service_date", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return { records: (data ?? []) as unknown as MaintRecord[] };
  });

export const createMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof MaintSchema>) => MaintSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("maintenance_records").insert({ user_id: context.userId, ...row(data) });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & z.infer<typeof MaintSchema>) =>
    z.object({ id: z.string().uuid() }).extend(MaintSchema.shape).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("maintenance_records").update(row(rest)).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("maintenance_records").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
