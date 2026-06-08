import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

export type PageTab = { to: string; label: string; icon?: ComponentType<{ className?: string }> };

export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-1">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon && <t.icon className="size-3.5" />}
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
