import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { entitlementErrorResponse } from "@/lib/fleetos/entitlement-error";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Entitlement failures always serialize as a stable JSON envelope so
    // the client can branch on { code, featureKey, isReadOnly, message }.
    const entitlementResponse = entitlementErrorResponse(error);
    if (entitlementResponse) return entitlementResponse;

    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/** Turns database plan-limit errors into a clean, user-facing message. */
const planLimitMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    const msg = (error as { message?: unknown })?.message;
    const m = typeof msg === "string" ? /PLAN_LIMIT_(?:USERS|TRUCKS):\s*(.*)/.exec(msg) : null;
    if (m) throw new Error(m[1]);
    throw error;
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, planLimitMiddleware],
  requestMiddleware: [errorMiddleware],
}));
