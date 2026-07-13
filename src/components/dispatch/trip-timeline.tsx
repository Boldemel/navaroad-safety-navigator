/**
 * Trip timeline: renders the Dispatch trip status milestones as a
 * horizontal (or vertical on mobile) stepper. Reusable across the web
 * app, load detail modals, and Rork mobile via a primitive shim — no
 * DOM/browser APIs are referenced.
 */
import {
  Check,
  ClipboardCheck,
  Handshake,
  Navigation,
  Package,
  PackageCheck,
  Truck,
  Flag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  TIMELINE_STEPS,
  type DispatchStatus,
} from "@/lib/dispatch.functions";
import { cn } from "@/lib/utils";

const STEP_META: Record<
  Exclude<DispatchStatus, "unassigned" | "cancelled">,
  { label: string; icon: LucideIcon }
> = {
  assigned: { label: "Assigned", icon: ClipboardCheck },
  accepted: { label: "Accepted", icon: Handshake },
  driving_to_pickup: { label: "To Pickup", icon: Navigation },
  loaded: { label: "Loaded", icon: Package },
  in_transit: { label: "In Transit", icon: Truck },
  delivered: { label: "Delivered", icon: PackageCheck },
  completed: { label: "Completed", icon: Flag },
};

function stepIndex(status: DispatchStatus): number {
  if (status === "unassigned") return -1;
  if (status === "cancelled") return -1;
  return TIMELINE_STEPS.indexOf(status);
}

export function TripTimeline({
  status,
  onSelect,
  className,
}: {
  status: DispatchStatus;
  /** Called when the dispatcher clicks a step (advance/rewind). */
  onSelect?: (next: DispatchStatus) => void;
  className?: string;
}) {
  const current = stepIndex(status);
  const cancelled = status === "cancelled";

  return (
    <ol
      role="list"
      className={cn(
        "flex flex-wrap items-start gap-y-3 gap-x-1 md:flex-nowrap",
        className,
      )}
      aria-label="Trip timeline"
    >
      {TIMELINE_STEPS.map((step, i) => {
        const meta = STEP_META[step as keyof typeof STEP_META];
        const Icon = cancelled ? Flag : meta.icon;
        const isDone = !cancelled && i < current;
        const isCurrent = !cancelled && i === current;
        const isFuture = cancelled || i > current;
        const clickable = !!onSelect;

        return (
          <li key={step} className="flex-1 min-w-[80px] flex flex-col items-center">
            <div className="flex items-center w-full">
              {i > 0 ? (
                <span
                  className={cn(
                    "h-0.5 flex-1",
                    cancelled
                      ? "bg-destructive/30"
                      : i <= current
                        ? "bg-primary"
                        : "bg-border",
                  )}
                />
              ) : (
                <span className="flex-1" />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect?.(step)}
                className={cn(
                  "size-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  isDone && "bg-primary border-primary text-primary-foreground",
                  isCurrent &&
                    "bg-background border-primary text-primary ring-2 ring-primary/30",
                  isFuture && "bg-background border-border text-muted-foreground",
                  cancelled && "border-destructive/40 text-destructive/60",
                  clickable && "cursor-pointer hover:border-primary",
                )}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={meta.label}
              >
                {isDone ? <Check className="size-4" /> : <Icon className="size-4" />}
              </button>
              {i < TIMELINE_STEPS.length - 1 ? (
                <span
                  className={cn(
                    "h-0.5 flex-1",
                    cancelled
                      ? "bg-destructive/30"
                      : i < current
                        ? "bg-primary"
                        : "bg-border",
                  )}
                />
              ) : (
                <span className="flex-1" />
              )}
            </div>
            <div
              className={cn(
                "mt-1.5 text-[10px] font-medium text-center leading-tight",
                isCurrent ? "text-foreground" : "text-muted-foreground",
                cancelled && "text-destructive/70",
              )}
            >
              {meta.label}
            </div>
          </li>
        );
      })}
      {cancelled ? (
        <li className="w-full text-center text-xs text-destructive font-medium mt-1">
          Cancelled
        </li>
      ) : null}
    </ol>
  );
}
