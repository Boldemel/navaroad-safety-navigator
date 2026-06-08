import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Package, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/loads")({
  component: LoadsLayout,
});

const tabs = [
  { to: "/loads", label: "Active Loads", icon: Package, exact: true },
  { to: "/loads/history", label: "Trip History", icon: BookOpen, exact: false },
];

function LoadsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div>
      <div className="border-b border-border bg-background">
        <div className="container max-w-4xl px-4 sm:px-6">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((t) => {
              const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <t.icon className="size-4" /> {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
