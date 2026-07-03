import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildFleetContext, type ContextScope } from "@/lib/ai/fleet-context.server";
import type { Database } from "@/integrations/supabase/types";

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

        // Resolve company + roles
        const { data: member } = await supabase
          .from("company_members")
          .select("id, company_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!member?.company_id) return new Response("No company", { status: 403 });

        const { data: rolesRows } = await supabase
          .from("company_member_roles")
          .select("role")
          .eq("member_id", member.id);
        const roles = (rolesRows ?? []).map((r: any) => r.role as string);

        const { data: company } = await supabase
          .from("companies")
          .select("owner_id")
          .eq("id", member.company_id)
          .maybeSingle();
        const isOwner = company?.owner_id === userId;
        const isDriver = roles.includes("driver");

        // Any authenticated company member may use the copilot; data is scoped below.
        const body = (await request.json()) as { messages?: UIMessage[] };
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }

        // Persist last user message
        const last = body.messages[body.messages.length - 1];
        if (last?.role === "user") {
          const text = last.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
          if (text.trim()) {
            await supabase.from("ai_chat_messages").insert({
              company_id: member.company_id,
              user_id: userId,
              role: "user",
              content: text,
            });
          }
        }

        const scope: ContextScope = {
          companyId: member.company_id,
          userId,
          isDriver,
          isOwner,
          roles,
        };
        const fleetContext = await buildFleetContext(supabase, scope);

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        const roleLabel = scope.isOwner ? "Fleet Owner" : (isDriver && roles.length === 1 ? "Driver" : "Fleet User");
        const scopeRule = scope.isDriver && !scope.isOwner && !roles.some((r) => r !== "driver")
          ? "This user is a DRIVER. Only discuss their own loads, HOS, documents, fuel, expenses, inspections, and truck. Never reveal other drivers' pay, other companies' data, or company-wide financials."
          : "This user has fleet-level access. You may discuss company-wide profitability, drivers, trucks, loads, compliance, and subscription details.";

        const system = `You are the Navaroad Copilot — an intelligent trucking assistant for a US fleet. The user is a ${roleLabel}.

${scopeRule}

You have a JSON snapshot below covering the last 90 days: company, subscription plan, loads (with active/delivered), fuel, expenses, settlements, maintenance, trips, HOS, IFTA, inspections, active hazards, expiring documents, per-truck and per-driver aggregates.

CAPABILITIES you can answer about:
- Route safety, active hazards, weather callouts (from hazards + trip safety scores)
- Truck parking / truck stops (guide the user to the Parking page for live search)
- Loads (active, delivered, revenue, next pickup/delivery)
- Drivers (performance, revenue, pay, HOS)
- HOS status and remaining drive time (from last 8 days duty minutes)
- IFTA miles and gallons by state
- Fuel log, price per gallon, MPG
- Expenses by category, vendor trends
- Settlements and driver pay
- Maintenance done and cost per truck; flag trucks with high repair spend
- Inspections and defects
- Driver documents expiring within 60 days
- Profitability by truck, driver, load, and company
- Subscription plan, trial end, status
- Company & team overview

RULES:
- Be concise. Use short bullets and dollar figures rounded to whole dollars.
- Cite numbers from the snapshot. If the snapshot lacks data, say so plainly — do not invent.
- Support follow-up questions; keep prior turns in mind.
- Voice-friendly: prefer short paragraphs and clear sentences.
- Never mention data from other companies. Never bypass the scope rule above.

NAVAROAD_SNAPSHOT_JSON:
${fleetContext}`;

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(body.messages),
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
