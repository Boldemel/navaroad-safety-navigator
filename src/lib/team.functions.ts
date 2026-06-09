import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ROLES } from "./company.shared";

const CreateUserSchema = z.object({
  companyId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  tempPassword: z.string().min(8).max(128),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  employeeId: z.string().trim().max(80).optional().or(z.literal("")),
  assignedTruck: z.string().trim().max(80).optional().or(z.literal("")),
  assignedTrailer: z.string().trim().max(80).optional().or(z.literal("")),
  roles: z.array(z.enum(ROLES)).min(1),
  active: z.boolean().default(true),
});

async function assertCanManage(
  supabase: any,
  userId: string,
  companyId: string,
) {
  const { data: ok, error } = await supabase.rpc("has_company_permission", {
    _user: userId,
    _company: companyId,
    _permission: "members.manage",
  });
  if (error) throw error;
  if (!ok) throw new Error("You don't have permission to manage team members.");
}

export const createCompanyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.companyId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create the auth user with a confirmed email so they can log in immediately
    const driverName = `${data.firstName} ${data.lastName}`.trim();
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.tempPassword,
        email_confirm: true,
        user_metadata: { driver_name: driverName },
      });
    if (createErr) throw new Error(createErr.message);
    const newUserId = created.user!.id;

    // The provision_company_for_new_user trigger created a personal company &
    // owner-membership for this user. Remove that so they belong only to the
    // caller's company.
    await supabaseAdmin
      .from("companies")
      .delete()
      .eq("owner_id", newUserId);

    // Insert into target company
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("company_members")
      .insert({ company_id: data.companyId, user_id: newUserId })
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

    // Update / upsert profile with the rest of the fields
    await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      driver_name: driverName,
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone || null,
      employee_id: data.employeeId || null,
      assigned_truck: data.assignedTruck || null,
      assigned_trailer: data.assignedTrailer || null,
      active: data.active,
      must_change_password: false,
      created_by_user_id: userId,
    });

    await supabaseAdmin.from("team_audit_logs").insert({
      company_id: data.companyId,
      actor_user_id: userId,
      target_user_id: newUserId,
      action: "user_created",
      details: { email: data.email, roles: data.roles },
    });

    return { ok: true, userId: newUserId };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        companyId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        tempPassword: z.string().min(8).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.companyId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.targetUserId,
      { password: data.tempPassword },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.targetUserId);

    await supabaseAdmin.from("team_audit_logs").insert({
      company_id: data.companyId,
      actor_user_id: userId,
      target_user_id: data.targetUserId,
      action: "password_reset",
      details: {},
    });
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        companyId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.companyId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ active: data.active })
      .eq("id", data.targetUserId);

    // Also ban / unban the auth user so deactivated users can't log in
    await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
      ban_duration: data.active ? "none" : "876000h",
    } as any);

    await supabaseAdmin.from("team_audit_logs").insert({
      company_id: data.companyId,
      actor_user_id: userId,
      target_user_id: data.targetUserId,
      action: data.active ? "user_reactivated" : "user_deactivated",
      details: {},
    });
    return { ok: true };
  });

export const completePasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const getMustChangePassword = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("must_change_password, active")
      .eq("id", userId)
      .maybeSingle();
    return {
      mustChange: !!data?.must_change_password,
      active: data?.active ?? true,
    };
  });

export const listTeamAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ companyId: z.string().uuid(), limit: z.number().min(1).max(200).default(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("team_audit_logs")
      .select("id, actor_user_id, target_user_id, action, details, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });
