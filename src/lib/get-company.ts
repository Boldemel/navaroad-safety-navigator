import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the company_id for an authenticated user from company_members.
 * Throws if the user is not a member of any company (should never happen
 * because the provision_company_for_new_user trigger creates one at signup).
 */
export async function getUserCompanyId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.company_id) throw new Error("No company found for user");
  return data.company_id as string;
}
