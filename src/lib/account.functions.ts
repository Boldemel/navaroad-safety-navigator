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

    // Protect customers from being billed after deleting their login, and
    // teams from losing their owner: block deletion until billing is cancelled
    // and other members are removed.
    const { data: owned } = await supabaseAdmin
      .from("companies")
      .select("id, billing_subscription_id")
      .eq("owner_id", uid);
    for (const c of owned ?? []) {
      const { count } = await supabaseAdmin
        .from("company_members")
        .select("id", { count: "exact", head: true })
        .eq("company_id", c.id)
        .neq("user_id", uid);
      if ((count ?? 0) > 0) {
        throw new Error("Remove your other team members from the Company page before deleting your account.");
      }
      if (c.billing_subscription_id) {
        const { stripeFetch } = await import("./stripe.server");
        let sub: any = null;
        try {
          sub = await stripeFetch(`/subscriptions/${c.billing_subscription_id}`);
        } catch {
          throw new Error("We couldn't confirm your billing status. Please try again, or cancel your subscription in Billing first.");
        }
        const live = ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(sub?.status);
        if (live && !sub?.cancel_at_period_end) {
          throw new Error("Cancel your subscription in Billing → Manage billing before deleting your account, so you aren't charged again.");
        }
      }
    }

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
