// Persist server-side errors caught by the SSR wrapper into error_logs.
// Best-effort: never throw.
export async function persistServerError(error: unknown, request?: Request) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isErr = error instanceof Error;
    const message = (isErr ? error.message || error.name : String(error)).slice(0, 2000);
    const stack = isErr ? (error.stack ?? null) : null;
    const url = request?.url ?? null;
    const ua = request?.headers.get("user-agent") ?? null;
    await supabaseAdmin.from("error_logs").insert({
      source: "ssr",
      message,
      stack: stack ? stack.slice(0, 8000) : null,
      url: url ? url.slice(0, 1000) : null,
      user_agent: ua ? ua.slice(0, 500) : null,
      severity: "error",
    });
  } catch (e) {
    console.error("[error-logs] server persist failed", e);
  }
}
