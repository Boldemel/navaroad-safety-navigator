import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlatformCompany = {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  memberCount: number;
  createdAt: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
};

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: super admin only");
}

export const listAllCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformCompany[]> => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: companies, error }, { data: members }, authRes, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("companies")
        .select("id, name, owner_id, created_at, subscription_plan, subscription_status")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("company_members").select("company_id"),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from("profiles").select("id, driver_name, first_name, last_name"),
    ]);
    if (error) throw error;

    const counts = new Map<string, number>();
    for (const m of members ?? []) {
      counts.set((m as any).company_id, (counts.get((m as any).company_id) ?? 0) + 1);
    }
    const emails = new Map<string, string>();
    for (const u of authRes.data?.users ?? []) emails.set(u.id, u.email ?? "");
    const names = new Map<string, string>();
    for (const p of profiles ?? []) {
      const n = (p as any).driver_name
        || [(p as any).first_name, (p as any).last_name].filter(Boolean).join(" ").trim();
      if (n) names.set((p as any).id, n);
    }

    return (companies ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      ownerId: c.owner_id,
      ownerEmail: emails.get(c.owner_id) ?? null,
      ownerName: names.get(c.owner_id) ?? null,
      memberCount: counts.get(c.id) ?? 0,
      createdAt: c.created_at,
      subscriptionPlan: c.subscription_plan,
      subscriptionStatus: c.subscription_status,
    }));
  });

export const setCompanySuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ companyId: z.string().uuid(), suspended: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ subscription_status: data.suspended ? "suspended" : "active" })
      .eq("id", data.companyId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("companies").delete().eq("id", data.companyId);
    if (error) throw error;
    return { ok: true };
  });
