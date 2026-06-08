import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["fleet_owner", "dispatcher", "safety_manager", "maintenance_manager", "driver"] as const;
export type CompanyRole = (typeof ROLES)[number];

const PERMISSIONS = [
  "company.manage", "members.manage",
  "loads.manage", "loads.view",
  "routes.manage", "routes.view",
  "inspections.manage", "inspections.view",
  "maintenance.manage", "maintenance.view",
  "documents.manage", "documents.view",
  "fuel.manage", "fuel.view",
  "expenses.manage", "expenses.view",
  "ifta.manage", "ifta.view",
  "hos.manage", "hos.view",
  "drive",
] as const;
export type AppPermission = (typeof PERMISSIONS)[number];

export type CompanyMember = {
  memberId: string;
  userId: string;
  driverName: string | null;
  email: string | null;
  isOwner: boolean;
  roles: CompanyRole[];
  overrides: { permission: AppPermission; granted: boolean }[];
};

export type CompanySummary = {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  myRoles: CompanyRole[];
  myMemberId: string;
};

/** Returns the user's primary (first) company. */
export const getMyCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanySummary | null> => {
    const { supabase, userId } = context;
    const { data: mem, error } = await supabase
      .from("company_members")
      .select("id, company_id, companies!inner(id, name, owner_id)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!mem) return null;
    const company = (mem as any).companies;
    const { data: roles } = await supabase
      .from("company_member_roles").select("role").eq("member_id", mem.id);
    return {
      id: company.id,
      name: company.name,
      ownerId: company.owner_id,
      isOwner: company.owner_id === userId,
      myRoles: (roles ?? []).map((r: any) => r.role),
      myMemberId: mem.id,
    };
  });

export const listCompanyMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CompanyMember[]> => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("company_members")
      .select("id, user_id, created_at, companies!inner(owner_id)")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    if (!members?.length) return [];

    const memberIds = members.map((m) => m.id);
    const userIds = members.map((m) => m.user_id);

    const [rolesRes, overridesRes] = await Promise.all([
      supabase.from("company_member_roles").select("member_id, role").in("member_id", memberIds),
      supabase.from("company_member_permission_overrides").select("member_id, permission, granted").in("member_id", memberIds),
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profilesRes, authRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, driver_name").in("id", userIds),
      supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
    ]);
    const emails = new Map<string, string>();
    for (const u of authRes.data?.users ?? []) if (userIds.includes(u.id)) emails.set(u.id, u.email ?? "");
    const names = new Map<string, string>();
    for (const p of profilesRes.data ?? []) names.set(p.id, p.driver_name ?? "");

    return members.map((m) => ({
      memberId: m.id,
      userId: m.user_id,
      driverName: names.get(m.user_id) ?? null,
      email: emails.get(m.user_id) ?? null,
      isOwner: (m as any).companies.owner_id === m.user_id,
      roles: (rolesRes.data ?? []).filter((r: any) => r.member_id === m.id).map((r: any) => r.role),
      overrides: (overridesRes.data ?? []).filter((o: any) => o.member_id === m.id).map((o: any) => ({ permission: o.permission, granted: o.granted })),
    }));
  });

export const updateCompanyName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("companies").update({ name: data.name }).eq("id", data.companyId);
    if (error) throw error;
    return { ok: true };
  });

/** Add a member by email. The user must already have a Navaroad account. */
export const addCompanyMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      companyId: z.string().uuid(),
      email: z.string().email().max(255),
      roles: z.array(z.enum(ROLES)).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Confirm caller has members.manage
    const { data: canManage } = await supabase.rpc("has_company_permission", {
      _user: userId, _company: data.companyId, _permission: "members.manage",
    });
    if (!canManage) throw new Error("You don't have permission to add members.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Find the user by email
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (listErr) throw listErr;
    const target = list.users.find((u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase());
    if (!target) throw new Error("No Navaroad user with that email. Ask them to sign up first.");

    // Insert membership using admin client (RLS bypass — we've checked permission above)
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("company_members")
      .insert({ company_id: data.companyId, user_id: target.id })
      .select("id")
      .single();
    if (memErr) {
      if (memErr.code === "23505") throw new Error("That user is already a member.");
      throw memErr;
    }
    const { error: rolesErr } = await supabaseAdmin
      .from("company_member_roles")
      .insert(data.roles.map((role) => ({ member_id: mem.id, role })));
    if (rolesErr) throw rolesErr;
    return { ok: true };
  });

export const removeCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("company_members").delete().eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

export const setMemberRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ memberId: z.string().uuid(), roles: z.array(z.enum(ROLES)) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error: delErr } = await supabase.from("company_member_roles").delete().eq("member_id", data.memberId);
    if (delErr) throw delErr;
    if (data.roles.length > 0) {
      const { error: insErr } = await supabase
        .from("company_member_roles")
        .insert(data.roles.map((r) => ({ member_id: data.memberId, role: r })));
      if (insErr) throw insErr;
    }
    return { ok: true };
  });

export const setPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      memberId: z.string().uuid(),
      permission: z.enum(PERMISSIONS),
      value: z.enum(["grant", "deny", "default"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.value === "default") {
      const { error } = await supabase
        .from("company_member_permission_overrides")
        .delete()
        .eq("member_id", data.memberId)
        .eq("permission", data.permission);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("company_member_permission_overrides")
        .upsert(
          { member_id: data.memberId, permission: data.permission, granted: data.value === "grant" },
          { onConflict: "member_id,permission" },
        );
      if (error) throw error;
    }
    return { ok: true };
  });

export { ROLES, PERMISSIONS };
