import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"]);
  if (error) throw new Error("Could not verify admin role.");
  if (!data?.length) throw new Error("Forbidden: admin or moderator role required.");
  return { isAdmin: data.some((r) => r.role === "admin") };
}

export type ModerationHazard = {
  id: string;
  hazard_type: string;
  severity: string;
  status: string;
  location: string;
  description: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  expires_at: string | null;
  confirm_count: number;
  dispute_count: number;
  photo_url: string | null;
};

export const listHazardsForModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ status: z.enum(["all", "active", "disputed", "expired"]).optional() })
      .optional()
      .parse(d) ?? {},
  )
  .handler(async ({ context, data }): Promise<ModerationHazard[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("hazard_reports")
      .select("id,hazard_type,severity,status,location,description,reporter_id,latitude,longitude,created_at,expires_at,confirm_count,dispute_count,photo_url")
      .order("created_at", { ascending: false })
      .limit(300);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.reporter_id).filter((x): x is string => !!x)));
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id,driver_name").in("id", ids);
      for (const p of profs ?? []) if (p.driver_name) nameMap.set(p.id, p.driver_name);
    }
    return (rows ?? []).map((r) => ({
      ...r,
      confirm_count: r.confirm_count ?? 0,
      dispute_count: r.dispute_count ?? 0,
      reporter_name: r.reporter_id ? nameMap.get(r.reporter_id) ?? null : null,
    }));
  });

export const moderateHazard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "expire", "reject", "delete"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "delete") {
      const { error } = await supabaseAdmin.from("hazard_reports").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const patch =
      data.action === "approve"
        ? { status: "active", expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
        : data.action === "expire"
          ? { status: "expired", expires_at: new Date().toISOString() }
          : { status: "rejected", expires_at: new Date().toISOString() };
    const { error } = await supabaseAdmin.from("hazard_reports").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type UserWithRoles = {
  id: string;
  driver_name: string | null;
  created_at: string;
  roles: Array<"admin" | "moderator" | "user">;
};

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserWithRoles[]> => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Forbidden: admin role required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id,driver_name,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");
    const map = new Map<string, Array<"admin" | "moderator" | "user">>();
    for (const r of roles ?? []) {
      const arr = map.get(r.user_id) ?? [];
      arr.push(r.role as "admin" | "moderator" | "user");
      map.set(r.user_id, arr);
    }
    return (profiles ?? []).map((p) => ({
      id: p.id,
      driver_name: p.driver_name,
      created_at: p.created_at,
      roles: map.get(p.id) ?? [],
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "moderator", "user"]),
        grant: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Forbidden: admin role required.");
    if (data.user_id === context.userId && data.role === "admin" && !data.grant) {
      throw new Error("You cannot revoke your own admin role.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
