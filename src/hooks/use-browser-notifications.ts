import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Browser-native (in-tab) notifications. No service worker / VAPID required.
 * Fires `new Notification(...)` when the user has granted permission AND has
 * `notify_push` enabled on their profile.
 */
export function useBrowserNotifications() {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied",
  );

  // Profile flag — gates whether we actually fire notifications.
  const { data: pushEnabled = true, refetch } = useQuery({
    queryKey: ["profile-notify-push"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase
        .from("profiles")
        .select("notify_push")
        .eq("id", u.user.id)
        .maybeSingle();
      return data?.notify_push ?? true;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!supported) return;
    const sync = () => setPermission(Notification.permission);
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [supported]);

  const request = useCallback(async () => {
    if (!supported) return "denied" as NotificationPermission;
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  }, [supported]);

  const notify = useCallback(
    (opts: { title: string; body?: string; tag?: string; icon?: string }) => {
      if (!supported) return;
      if (permission !== "granted") return;
      if (!pushEnabled) return;
      // Don't double-fire when the tab is already focused — the in-app banner shows.
      if (typeof document !== "undefined" && document.visibilityState === "visible") return;
      try {
        new Notification(opts.title, {
          body: opts.body,
          tag: opts.tag,
          icon: opts.icon ?? "/favicon.ico",
          silent: false,
        });
      } catch {
        /* ignore */
      }
    },
    [permission, pushEnabled, supported],
  );

  return { supported, permission, pushEnabled, request, notify, refetch };
}
