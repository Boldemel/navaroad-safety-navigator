import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Map, AlertTriangle, Bell, User, LogOut, Truck, Shield, Users, FileWarning } from "lucide-react";
import { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NavigationBanner } from "@/components/navigation-banner";
import { ProximityAlertStack } from "@/components/proximity-alert-stack";
import { OfflineBanner } from "@/components/offline-banner";
import { useIsAdmin } from "@/hooks/use-is-admin";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/hazard-map", label: "Hazard Map", icon: Map },
  { to: "/report", label: "Report Hazard", icon: AlertTriangle },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
];

const adminNav = [
  { to: "/admin/moderation", label: "Moderation", icon: Shield },
  { to: "/admin/users", label: "User roles", icon: Users },
  { to: "/admin/error-logs", label: "Error logs", icon: FileWarning },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  // Sign-out hygiene: cancel in-flight queries, drop cached protected data,
  // sign out, then REPLACE history so Back can't restore the protected route.
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside className="hidden md:flex w-60 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="size-9 rounded-md bg-primary flex items-center justify-center">
            <Truck className="size-5 text-primary-foreground" />
          </div>
          <div className="font-semibold tracking-tight text-sidebar-foreground">Navaroad</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
          {isAdmin && (
            <div className="pt-3 mt-3 border-t border-sidebar-border space-y-1">
              <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Admin</div>
              {adminNav.map((n) => {
                const active = pathname === n.to || pathname.startsWith(n.to + "/");
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    )}
                  >
                    <n.icon className="size-4" />
                    {n.label}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        <button
          onClick={signOut}
          className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-14 flex items-center justify-between px-4 border-b border-border bg-sidebar">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-primary flex items-center justify-center">
              <Truck className="size-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">Navaroad</span>
          </div>
          <button onClick={signOut} className="text-sm text-muted-foreground"><LogOut className="size-4" /></button>
        </header>

        <OfflineBanner />
        <NavigationBanner />
        <ProximityAlertStack />
        <main className="flex-1 overflow-x-hidden">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden sticky bottom-0 grid grid-cols-5 border-t border-border bg-sidebar">
          {nav.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <n.icon className="size-5" />
                {n.label.split(" ")[0]}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
