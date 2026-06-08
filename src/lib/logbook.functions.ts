import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";

export type DutyStatus = "off" | "sleeper" | "driving" | "onduty";

export type DutyLog = {
  id: string;
  user_id: string;
  status: DutyStatus;
  started_at: string;
  ended_at: string | null;
  location: string | null;
  vehicle_unit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const Schema = z.object({
  status: z.enum(["off", "sleeper", "driving", "onduty"]),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  vehicleUnit: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function row(d: z.infer<typeof Schema>) {
  return {
    status: d.status,
    started_at: d.startedAt,
    ended_at: d.endedAt ?? null,
    location: d.location ?? null,
    vehicle_unit: d.vehicleUnit ?? null,
    notes: d.notes ?? null,
  };
}

export const listDutyLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fromIso: string; toIso: string }) =>
    z.object({ fromIso: z.string().datetime({ offset: true }), toIso: z.string().datetime({ offset: true }) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("duty_status_logs").select("*")
      .gte("started_at", data.fromIso).lte("started_at", data.toIso)
      .order("started_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { logs: (rows ?? []) as unknown as DutyLog[] };
  });

export const createDutyLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof Schema>) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase.from("duty_status_logs").insert({ user_id: context.userId, company_id: companyId, ...row(data) });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDutyLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & z.infer<typeof Schema>) =>
    z.object({ id: z.string().uuid() }).extend(Schema.shape).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("duty_status_logs").update(row(rest)).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDutyLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("duty_status_logs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
