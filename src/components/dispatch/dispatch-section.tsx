/**
 * Generic titled section shell used across the Dispatch dashboard.
 * Purely presentational — Rork-portable.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DispatchSection({
  title,
  icon: Icon,
  count,
  action,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card overflow-hidden flex flex-col",
        className,
      )}
    >
      <header className="px-3 py-2 border-b bg-sidebar/30 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold flex-1 truncate">{title}</h2>
        {typeof count === "number" ? (
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground bg-muted rounded-md px-1.5 py-0.5">
            {count}
          </span>
        ) : null}
        {action}
      </header>
      <div className="flex-1 min-h-0 overflow-auto p-2">{children}</div>
    </section>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground text-center py-6">{children}</div>
  );
}
