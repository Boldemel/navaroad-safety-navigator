import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

type LogInput = {
  source: string;
  message: string;
  stack?: string | null;
  url?: string | null;
  route?: string | null;
  severity?: "error" | "warning" | "info";
  context?: Record<string, unknown> | null;
  userId?: string | null;
};

const MAX_STR = 8000;
const trim = (v: string | null | undefined, max = MAX_STR) =>
  v == null ? null : v.length > max ? v.slice(0, max) : v;

export const logClientError = createServerFn({ method: "POST" })
  .inputValidator((data: LogInput) => {
    if (!data || typeof data.message !== "string" || typeof data.source !== "string") {
      throw new Error("Invalid error log payload");
    }
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const userAgent = getRequestHeader("user-agent") ?? null;
      const { error } = await supabaseAdmin.from("error_logs").insert({
        source: trim(data.source, 200) ?? "unknown",
        message: trim(data.message, 2000) ?? "",
        stack: trim(data.stack),
        url: trim(data.url, 1000),
        route: trim(data.route, 500),
        severity: data.severity ?? "error",
        context: data.context ?? null,
        user_agent: trim(userAgent, 500),
        user_id: data.userId ?? null,
      });
      if (error) {
        console.error("[error-logs] insert failed", error);
        return { ok: false };
      }
      return { ok: true };
    } catch (e) {
      console.error("[error-logs] handler crashed", e);
      return { ok: false };
    }
  });
