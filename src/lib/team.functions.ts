import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ROLES, ELD_SYSTEMS, usernameToSyntheticEmail } from "./company.shared";

const UsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, dot, underscore, dash");

const CreateUserSchema = z.object({
  companyId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  // Either email OR username is required.
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  username: UsernameSchema.optional().or(z.literal("")),
  tempPassword: z.string().min(8).max(128),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  employeeId: z.string().trim().max(80).optional().or(z.literal("")),
  driverIdNumber: z.string().trim().max(80).optional().or(z.literal("")),
  assignedTruck: z.string().trim().max(80).optional().or(z.literal("")),
  assignedTrailer: z.string().trim().max(80).optional().or(z.literal("")),
  roles: z.array(z.enum(ROLES)).min(1),
  active: z.boolean().default(true),
  // Optional ELD credentials
  eldSystem: z.enum(ELD_SYSTEMS).optional(),
  eldUserId: z.string().trim().max(128).optional().or(z.literal("")),
  eldPassword: z.string().max(256).optional().or(z.literal("")),
  eldVisibleToDriver: z.boolean().default(false),
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

    if (!data.email && !data.username) {
      throw new Error("Provide either an email or a username for login.");
    }

    const loginEmail = data.email
      ? data.email.trim().toLowerCase()
      : usernameToSyntheticEmail(data.username!);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const driverName = `${data.firstName} ${data.lastName}`.trim();
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
        password: data.tempPassword,
        email_confirm: true,
        user_metadata: { driver_name: driverName },
      });
    if (createErr) throw new Error(createErr.message);
    const newUserId = created.user!.id;

    // Remove the auto-provisioned personal company so they belong only to ours.
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

    await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      driver_name: driverName,
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone || null,
      employee_id: data.employeeId || null,
      driver_id_number: data.driverIdNumber || null,
      username: data.username || null,
      assigned_truck: data.assignedTruck || null,
      assigned_trailer: data.assignedTrailer || null,
      eld_system: data.eldSystem || null,
      active: data.active,
      must_change_password: false,
      created_by_user_id: userId,
    });

    if (!data.active) {
      await supabaseAdmin.auth.admin.updateUserById(newUserId, {
        ban_duration: "876000h",
      } as any);
    }

    // Optional ELD credentials
    if (data.eldUserId || data.eldPassword || data.eldSystem) {
      await supabaseAdmin.from("driver_eld_credentials").upsert(
        {
          user_id: newUserId,
          company_id: data.companyId,
          eld_user_id: data.eldUserId || null,
          eld_password: data.eldPassword || null,
          eld_system: data.eldSystem || null,
          visible_to_driver: data.eldVisibleToDriver,
          created_by_user_id: userId,
        },
        { onConflict: "user_id,company_id" },
      );
    }

    await supabaseAdmin.from("team_audit_logs").insert({
      company_id: data.companyId,
      actor_user_id: userId,
      target_user_id: newUserId,
      action: "user_created",
      details: {
        login: loginEmail,
        username: data.username || null,
        roles: data.roles,
        eld_system: data.eldSystem || null,
      },
    });

    return { ok: true, userId: newUserId, login: loginEmail };
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
      .update({ must_change_password: false })
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

/** Manager view of a driver's ELD credentials. */
export const getEldCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        companyId: z.string().uuid(),
        targetUserId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.companyId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("driver_eld_credentials")
      .select("eld_user_id, eld_password, eld_system, visible_to_driver, updated_at")
      .eq("company_id", data.companyId)
      .eq("user_id", data.targetUserId)
      .maybeSingle();
    if (error) throw error;
    return (
      row ?? {
        eld_user_id: null,
        eld_password: null,
        eld_system: null,
        visible_to_driver: false,
        updated_at: null,
      }
    );
  });

export const setEldCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        companyId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        eldSystem: z.enum(ELD_SYSTEMS).optional(),
        eldUserId: z.string().trim().max(128).optional().or(z.literal("")),
        eldPassword: z.string().max(256).optional().or(z.literal("")),
        visibleToDriver: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.companyId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("driver_eld_credentials").upsert(
      {
        company_id: data.companyId,
        user_id: data.targetUserId,
        eld_system: data.eldSystem || null,
        eld_user_id: data.eldUserId || null,
        eld_password: data.eldPassword || null,
        visible_to_driver: data.visibleToDriver,
        created_by_user_id: userId,
      },
      { onConflict: "user_id,company_id" },
    );
    if (error) throw error;

    // Also keep profile.eld_system in sync for at-a-glance display
    await supabaseAdmin
      .from("profiles")
      .update({ eld_system: data.eldSystem || null })
      .eq("id", data.targetUserId);

    return { ok: true };
  });

/** Driver-side: read own ELD credentials if the manager has shared them. */
export const getMyEldCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // RLS limits this to rows with visible_to_driver = true
    const { data, error } = await supabase
      .from("driver_eld_credentials")
      .select("eld_user_id, eld_password, eld_system, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  });
