import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently deletes the signed-in user's account and all linked rows.
 * Uses the service-role admin client AFTER requireSupabaseAuth verifies the
 * caller, so we always delete `auth.uid()` — never an arbitrary user id from
 * the client.
 */
export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    // Best-effort cleanup of user-owned rows. auth.users delete cascades
    // through ON DELETE CASCADE foreign keys (profiles) but the other tables
    // store user_id without a FK, so wipe them explicitly first.
    await supabaseAdmin.from("favorite_locations").delete().eq("user_id", uid);
    await supabaseAdmin.from("saved_routes").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("profiles").delete().eq("id", uid);
    // Keep community hazard reports but detach the reporter.
    await supabaseAdmin.from("hazard_reports").update({ reporter_id: null }).eq("reporter_id", uid);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
