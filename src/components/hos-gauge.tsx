import { cn } from "@/lib/utils";

/**
 * Semicircle gauge (Garmin/ELD-style) — pure SVG so it renders on any device.
 * Pass `usedMin` and `maxMin`; the arc fills clockwise and color shifts
 * from primary → warning → destructive as the remaining time shrinks.
 */
export function HosGauge({
  label,
  usedMin,
  maxMin,
  unit = "remaining",
  size = 168,
  formatValue,
  inactive = false,
}: {
  label: string;
  usedMin: number;
  maxMin: number;
  unit?: string;
  size?: number;
  formatValue?: (remainingMin: number) => string;
  inactive?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, usedMin / Math.max(1, maxMin)));
  const remaining = Math.max(0, maxMin - usedMin);
  const state =
    inactive ? "muted"
    : pct >= 1 ? "destructive"
    : pct >= 0.85 ? "warning"
    : "primary";

  // Geometry: arc from -180° (left) sweeping to 0° (right). 180° total.
  const stroke = Math.max(10, Math.round(size * 0.085));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r; // half-circle length
  const dashOffset = circumference * (1 - pct);

  // Format display value
  const h = Math.floor(remaining / 60);
  const m = Math.round(remaining % 60);
  const value = formatValue ? formatValue(remaining) : `${h}:${m.toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg
        width={size}
        height={size / 2 + stroke / 2 + 4}
        viewBox={`0 0 ${size} ${size / 2 + stroke / 2 + 4}`}
        className="overflow-visible"
        aria-hidden
      >
        {/* Track */}
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="opacity-40"
        />
        {/* Progress */}
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-out",
            state === "destructive" && "stroke-destructive",
            state === "warning" && "stroke-warning",
            state === "primary" && "stroke-primary",
            state === "muted" && "stroke-muted-foreground/40",
          )}
        />
      </svg>
      <div className="-mt-10 text-center">
        <div
          className={cn(
            "text-2xl font-bold tabular-nums leading-none",
            state === "destructive" && "text-destructive",
            state === "warning" && "text-warning",
            state === "muted" && "text-muted-foreground",
            state === "primary" && "text-foreground",
          )}
        >
          {value}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
          {unit}
        </div>
      </div>
      <div className="text-xs font-medium text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
