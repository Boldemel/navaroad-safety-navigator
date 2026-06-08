import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export const listAssistantHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ai_chat_messages")
      .select("id,role,content,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return { messages: (data ?? []) as StoredChatMessage[] };
  });

export const clearAssistantHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("ai_chat_messages")
      .delete()
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
