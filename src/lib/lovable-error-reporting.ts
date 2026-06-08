import { useServerFn } from "@tanstack/react-start";
import { logClientError } from "@/lib/error-logs.functions";

type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
  }
}

// Dedupe identical errors within a short window to avoid log floods.
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

function shouldSend(key: string) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  if (recent.has(key)) return false;
  recent.set(key, now);
  return true;
}

function errorBits(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack ?? null };
  }
  try {
    return { message: typeof error === "string" ? error : JSON.stringify(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

async function persist(error: unknown, source: string, context: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const bits = errorBits(error);
  const key = `${source}:${bits.message}`;
  if (!shouldSend(key)) return;
  try {
    await logClientError({
      data: {
        source,
        message: bits.message,
        stack: bits.stack,
        url: window.location.href,
        route: window.location.pathname,
        severity: "error",
        context,
      },
    });
  } catch {
    // Never let logging itself throw.
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const ctx = {
    source: "react_error_boundary",
    route: window.location.pathname,
    ...context,
  };
  window.__lovableEvents?.captureException?.(error, ctx, {
    mechanism: "react_error_boundary",
    handled: false,
    severity: "error",
  });
  void persist(error, String(ctx.source ?? "react_error_boundary"), ctx);
}

let installed = false;
export function installGlobalErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    void persist(e.error ?? e.message, "window.onerror", {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    void persist(e.reason, "unhandledrejection", {});
  });
}

/** Convenience hook so components can use `useServerFn` wiring if needed. */
export function useErrorLogger() {
  return useServerFn(logClientError);
}
