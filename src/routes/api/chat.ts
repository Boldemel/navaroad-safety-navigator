import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildFleetContext } from "@/lib/ai/fleet-context.server";
import type { Database } from "@/integrations/supabase/types";

const ALLOWED_ROLES = new Set([
  "fleet_owner",
  "company_owner",
  "fleet_manager",
  "accountant",
  "safety_manager",
]);

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        const supaUrl = process.env.SUPABASE_URL;
        const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apiKey || !supaUrl || !supaKey) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7);

        const supabase = createClient<Database>(supaUrl, supaKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        // Resolve company
        const { data: member } = await supabase
          .from("company_members")
          .select("id, company_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!member?.company_id) return new Response("No company", { status: 403 });

        // Check role
        const { data: roles } = await supabase
          .from("company_member_roles")
          .select("role")
          .eq("member_id", member.id);
        const roleSet = new Set((roles ?? []).map((r) => r.role as string));
        const { data: company } = await supabase
          .from("companies")
          .select("owner_id")
          .eq("id", member.company_id)
          .maybeSingle();
        const isOwner = company?.owner_id === userId;
        const hasAccess = isOwner || Array.from(roleSet).some((r) => ALLOWED_ROLES.has(r));
        if (!hasAccess) return new Response("Forbidden", { status: 403 });

        const body = (await request.json()) as { messages?: UIMessage[] };
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }

        // Persist last user message
        const last = body.messages[body.messages.length - 1];
        if (last?.role === "user") {
          const text = last.parts
            .map((p: any) => (p.type === "text" ? p.text : ""))
            .join("");
          if (text.trim()) {
            await supabase.from("ai_chat_messages").insert({
              company_id: member.company_id,
              user_id: userId,
              role: "user",
              content: text,
            });
          }
        }

        const fleetContext = await buildFleetContext(supabase);

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        const system = `You are the Navaroad Fleet AI Assistant for a trucking company. You help fleet owners and managers analyze profitability, compliance, and driver performance.

You are given a JSON snapshot of the last 90 days of company data below. Use it to answer questions about specific trucks (by vehicle_unit), drivers (by user_id), loads, fuel, maintenance, settlements, and expenses.

When asked about profitability:
- Per truck: revenue (sum of delivered load rate_usd) minus fuel_cost + maint_cost + driver pay + expenses associated to that truck.
- Per driver: revenue (delivered loads) minus settled_pay, deductions, expenses, fuel_cost.
- Surface deadhead, low rate-per-mile, high fuel cost-per-gallon, repair spikes, expense outliers.
- Always cite numbers from the snapshot. If data is missing, say so plainly.

Be concise. Use bullet points and dollar figures. Round to whole dollars. Never invent numbers.

FLEET_SNAPSHOT_JSON:
${fleetContext}`;

        const result = streamText({
          model,
          system,
          messages: convertToModelMessages(body.messages),
          onFinish: async ({ text }) => {
            if (text?.trim()) {
              await supabase.from("ai_chat_messages").insert({
                company_id: member.company_id,
                user_id: userId,
                role: "assistant",
                content: text,
              });
            }
          },
        });

        return result.toUIMessageStreamResponse({ originalMessages: body.messages });
      },
    },
  },
});
