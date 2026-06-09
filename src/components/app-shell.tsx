import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Map, Bell, User, LogOut, Truck, Shield, Users, FileWarning, BookOpen, ClipboardCheck, Package, ParkingCircle, MapPinned, FolderLock, Wrench, Receipt, Fuel, ClipboardList, Building2, Sparkles } from "lucide-react";
import { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NavigationBanner } from "@/components/navigation-banner";
import { ProximityAlertStack } from "@/components/proximity-alert-stack";
import { OfflineBanner } from "@/components/offline-banner";
import { NotificationBell } from "@/components/notification-bell";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useAllowedModules } from "@/hooks/use-allowed-modules";
import { ForcePasswordChange } from "@/components/force-password-change";
import { getMustChangePassword } from "@/lib/team.functions";

const nav = [
  { to: "/dashboard", label: "Route Analysis", icon: LayoutDashboard },
  { to: "/hazard-map", label: "Hazards and Alerts", icon: Map },
  { to: "/parking", label: "Parking & Stops", icon: ParkingCircle },
  { to: "/loads", label: "Loads", icon: Package },
  { to: "/inspections", label: "Inspections", icon: ClipboardCheck },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/documents", label: "Driver Documents", icon: FolderLock },
  { to: "/fuel", label: "Fuel Log", icon: Fuel },
  { to: "/expenses", label: "Expenses & Earnings", icon: Receipt },
  { to: "/ifta", label: "IFTA Mileage", icon: MapPinned },
  { to: "/logbook", label: "Logbook & HOS", icon: ClipboardList },
  { to: "/assistant", label: "Fleet AI Assistant", icon: Sparkles },
  
  { to: "/company", label: "Company & Team", icon: Building2 },
  { to: "/profile", label: "Profile", icon: User },
];

const mobileNav = [
  { to: "/dashboard", label: "Route", icon: LayoutDashboard },
  { to: "/parking", label: "Stops", icon: ParkingCircle },
  { to: "/loads", label: "Loads", icon: Package },
  { to: "/logbook", label: "HOS", icon: ClipboardList },
  { to: "/profile", label: "Me", icon: User },
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
  const { allowed } = useAllowedModules();
  const visibleNav = allowed ? nav.filter((n) => allowed.has(n.to)) : nav;
  const visibleMobileNav = allowed ? mobileNav.filter((n) => allowed.has(n.to)) : mobileNav;

  // Sign-out hygiene: cancel in-flight queries, drop cached protected data,
  // sign out, then REPLACE history so Back can't restore the protected route.
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const mustChangeFn = useServerFn(getMustChangePassword);
  const mustChange = useQuery({
    queryKey: ["must-change-password"],
    queryFn: () => mustChangeFn(),
    staleTime: 30_000,
  });

  if (mustChange.data?.mustChange) {
    return <ForcePasswordChange />;
  }

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside className="hidden md:flex w-60 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="size-9 rounded-md bg-primary flex items-center justify-center">
            <Truck className="size-5 text-primary-foreground" />
          </div>
          <div className="font-semibold tracking-tight text-sidebar-foreground flex-1">Navaroad</div>
          <NotificationBell />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map((n) => {
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
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button onClick={signOut} className="text-sm text-muted-foreground p-2"><LogOut className="size-4" /></button>
          </div>
        </header>

        <OfflineBanner />
        <NavigationBanner />
        <ProximityAlertStack />
        <main className="flex-1 overflow-x-hidden">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden sticky bottom-0 grid grid-cols-5 border-t border-border bg-sidebar">
          {visibleMobileNav.map((n) => {
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
