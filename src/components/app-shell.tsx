import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Map, Bell, User, LogOut, Truck, Shield, ShieldAlert, Users, FileWarning, BookOpen, ClipboardCheck, Package, ParkingCircle, MapPinned, FolderLock, Wrench, Receipt, Fuel, ClipboardList, Building2, Sparkles, TrendingUp, FileBarChart, UserCheck, Menu, CreditCard, HelpCircle } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { getModuleForRoute } from "@/lib/fleetos/module-registry";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NavigationBanner } from "@/components/navigation-banner";
import { ProximityAlertStack } from "@/components/proximity-alert-stack";
import { OfflineBanner } from "@/components/offline-banner";
import { NotificationBell } from "@/components/notification-bell";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";
import { useAllowedModules } from "@/hooks/use-allowed-modules";
import { HelpDrawer } from "@/components/help/help-drawer";
import { NavaroadMark } from "@/components/brand/logo";


const nav = [
  { to: "/home", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dashboard", label: "Route Analysis", icon: Map },
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
  { to: "/fleet-profitability", label: "Profitability Analysis", icon: TrendingUp },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/driver-performance", label: "Driver Performance", icon: UserCheck },
  { to: "/trucks", label: "Trucks", icon: Truck },
  { to: "/assistant", label: "Fleet AI Assistant", icon: Sparkles },
  
  { to: "/help", label: "Help", icon: HelpCircle },
  { to: "/company", label: "Company & Team", icon: Building2 },
  { to: "/billing", label: "Billing & Plans", icon: CreditCard },
  { to: "/profile", label: "Profile", icon: User },
];

const mobileNav = [
  { to: "/home", label: "Home", icon: LayoutDashboard },
  { to: "/dashboard", label: "Route", icon: Map },
  { to: "/loads", label: "Loads", icon: Package },
  { to: "/logbook", label: "HOS", icon: ClipboardList },
];

const adminNav = [
  { to: "/admin/moderation", label: "Moderation", icon: Shield },
  { to: "/admin/users", label: "User roles", icon: Users },
  { to: "/admin/error-logs", label: "Error logs", icon: FileWarning },
];

const superAdminNav = [
  { to: "/admin/platform", label: "Platform Admin", icon: ShieldAlert },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { loading: modulesLoading, allowed } = useAllowedModules();
  const visibleNav = allowed ? nav.filter((n) => allowed.has(n.to)) : nav;
  const visibleMobileNav = allowed ? mobileNav.filter((n) => allowed.has(n.to)) : mobileNav;
  const [moreOpen, setMoreOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Registry-driven route guard: if the current URL maps to a registered
  // module the user isn't entitled to, bounce to /dashboard. Admin routes
  // are checked separately via useIsAdmin / useIsSuperAdmin.
  useEffect(() => {
    if (modulesLoading || allowed === null) return;
    if (pathname.startsWith("/admin/")) return;
    const mod = getModuleForRoute(pathname);
    if (!mod) return; // unregistered route → let the router handle it
    if (mod.alwaysAvailable) return;
    const permitted = mod.routes.some((r) => allowed.has(r));
    if (!permitted) {
      router.navigate({ to: "/dashboard", replace: true });
    }
  }, [pathname, modulesLoading, allowed, router]);

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
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          <NavaroadMark size={36} />

          <div className="font-semibold tracking-tight text-sidebar-foreground flex-1 leading-none">Navaroad</div>

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="p-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Help"
            title="Help"
          >
            <HelpCircle className="size-4" />
          </button>
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
          {isSuperAdmin && (
            <div className="pt-3 mt-3 border-t border-sidebar-border space-y-1">
              <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Platform</div>
              {superAdminNav.map((n) => {
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
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button className="p-2 -ml-2 text-sidebar-foreground" aria-label="Open menu">
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-sidebar">
                <SheetHeader className="px-4 py-4 border-b border-sidebar-border">
                  <SheetTitle className="text-left">Navaroad</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-[calc(100%-65px)] p-3 space-y-1">
                  {visibleNav.map((n) => {
                    const active = pathname === n.to || pathname.startsWith(n.to + "/");
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        onClick={() => setMoreOpen(false)}
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
                      {adminNav.map((n) => (
                        <Link
                          key={n.to}
                          to={n.to}
                          onClick={() => setMoreOpen(false)}
                          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        >
                          <n.icon className="size-4" />
                          {n.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  {isSuperAdmin && (
                    <div className="pt-3 mt-3 border-t border-sidebar-border space-y-1">
                      <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Platform</div>
                      {superAdminNav.map((n) => (
                        <Link
                          key={n.to}
                          to={n.to}
                          onClick={() => setMoreOpen(false)}
                          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        >
                          <n.icon className="size-4" />
                          {n.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { setMoreOpen(false); signOut(); }}
                    className="mt-3 w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
                  >
                    <LogOut className="size-4" /> Sign out
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <NavaroadMark size={32} />
            <span className="font-semibold tracking-tight leading-none">Navaroad</span>



          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="p-2 text-sidebar-foreground/70"
              aria-label="Help"
            >
              <HelpCircle className="size-4" />
            </button>
            <NotificationBell />
            <button onClick={signOut} className="text-sm text-muted-foreground p-2"><LogOut className="size-4" /></button>
          </div>
        </header>

        <HelpDrawer open={helpOpen} onOpenChange={setHelpOpen} />

        <OfflineBanner />
        <SubscriptionBanner />
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
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground"
          >
            <Menu className="size-5" />
            More
          </button>
        </nav>
      </div>
    </div>
  );
}
