import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Called only after the route resolves the authenticated caller's membership. */
export async function checkChatAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  companyId: string,
): Promise<Response | null> {
  const unavailable = () => Response.json({
    code: "AUTHORIZATION_UNAVAILABLE",
    message: "Unable to verify assistant access. Please try again later.",
  }, { status: 503 });

  const { data: superAdmin, error: roleError } = await supabase.rpc("is_super_admin", { _user: userId });
  if (roleError) return unavailable();
  // Preserve the platform's existing, server-verified super-admin exemption.
  if (superAdmin === true) return null;

  const [subscription, feature] = await Promise.all([
    supabase.rpc("is_company_read_only", { _company: companyId }),
    supabase.rpc("company_has_feature", { _company: companyId, _feature: "ai_assistant" }),
  ]);
  if (subscription.error || feature.error || typeof subscription.data !== "boolean" || typeof feature.data !== "boolean") {
    return unavailable();
  }
  if (subscription.data) {
    return Response.json({
      code: "SUBSCRIPTION_READ_ONLY",
      featureKey: "ai_assistant",
      isReadOnly: true,
      message: "Complete checkout or reactivate billing to use the assistant.",
    }, { status: 402 });
  }
  if (!feature.data) {
    return Response.json({
      code: "FEATURE_NOT_ENTITLED",
      featureKey: "ai_assistant",
      isReadOnly: false,
      message: "Your plan does not include the AI assistant.",
    }, { status: 403 });
  }
  return null;
}