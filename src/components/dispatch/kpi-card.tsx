/**
 * Reusable KPI card for the Dispatch dashboard and other FleetOS
 * ops surfaces. Pure presentation; no browser-only APIs, so this
 * component ports cleanly to Rork (React Native) via a shared
 * primitive shim.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone = "default" | "primary" | "success" | "warning" | "destructive";

const TONE_STYLES: Record<KpiTone, string> = {
  default: "border-border bg-card",
  primary: "border-primary/30 bg-primary/5",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/30 bg-warning/5",
  destructive: "border-destructive/30 bg-destructive/5",
};

const TONE_ICON: Record<KpiTone, string> = {
  default: "text-muted-foreground bg-muted",
  primary: "text-primary bg-primary/10",
  success: "text-success bg-success/10",
  warning: "text-warning bg-warning/10",
  destructive: "text-destructive bg-destructive/10",
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  onClick,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  onClick?: () => void;
  className?: string;
}) {
  const Component: "button" | "div" = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-3 transition-colors",
        TONE_STYLES[tone],
        onClick && "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("size-10 rounded-lg flex items-center justify-center", TONE_ICON[tone])}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </div>
          <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
          {hint ? (
            <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
          ) : null}
        </div>
      </div>
    </Component>
  );
}
