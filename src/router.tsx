import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";

function friendlyMessage(error: unknown): string {
  if (error instanceof Error) {
    const m = error.message || "";
    if (/network|fetch|failed to fetch|load failed/i.test(m)) {
      return "Network hiccup — check your connection and try again.";
    }
    if (/unauthor|401/i.test(m)) return "Your session expired. Please sign in again.";
    if (/forbid|403/i.test(m)) return "You don't have permission to do that.";
    if (/not found|404/i.test(m)) return "We couldn't find that.";
    if (/rate limit|429/i.test(m)) return "You're going a bit fast — try again in a moment.";
    if (m.length > 0 && m.length < 160) return m;
  }
  return "Something went wrong. Please try again.";
}

// Backoff: 250ms, 500ms, 1s, … capped at 8s.
const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 8_000);

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        retryDelay: backoff,
        // Don't auto-refetch on focus for already-fresh data; cuts noise on flaky links.
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Only surface user-visible failures; silent background refetches stay quiet
        // unless they have an explicit meta flag.
        if (query.meta?.suppressErrorToast) return;
        if (query.state.data !== undefined) return; // had cached data; don't nag
        toast.error(friendlyMessage(error));
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.suppressErrorToast) return;
        if (mutation.options.onError) return; // caller handles it
        toast.error(friendlyMessage(error));
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
