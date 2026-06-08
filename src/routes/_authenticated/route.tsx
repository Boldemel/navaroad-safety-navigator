import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    // Check local session first — avoids redirecting authenticated users
    // back to /auth when the network call to /auth/v1/user fails transiently
    // (common on mobile). If a session exists, trust it; supabase-js will
    // refresh it as needed.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      return { user: sessionData.session.user };
    }

    // No local session — confirm with server before redirecting.
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });
      return { user: data.user };
    } catch (e) {
      if (isRedirect(e)) throw e;
      // Network failure with no local session: send to /auth.
      throw redirect({ to: "/auth" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
