/**
 * Navaroad brand system — SVG logos.
 *
 * Concept #2 (Road Monogram N), refined:
 *  - Two bold vertical stems read as the "N".
 *  - The diagonal is drawn as a ROAD (dual outer edges + dashed center lane),
 *    not a solid parallelogram — preserving the road/trucking meaning.
 *  - Orange waypoint node pinned to the upper-right terminal (destination marker).
 *
 * Rork-portable: pure SVG primitives. For React Native, swap for react-native-svg
 * (Svg, Rect, Path, Circle, G, Line) — structure/props map 1:1.
 */
import { cn } from "@/lib/utils";

const ACCENT = "hsl(24 95% 55%)";

/** Core "N as Road" mark. 64×64 grid. Scales cleanly from 16px to 1024px. */
export function NavaroadMark({
  className,
  size = 32,
  monoColor,
  accentColor = ACCENT,
  title = "Navaroad",
}: {
  className?: string;
  size?: number;
  /** If set, renders monochrome (waypoint uses same color). */
  monoColor?: string;
  accentColor?: string;
  title?: string;
}) {
  const c = monoColor ?? "currentColor";
  const lane = monoColor ?? accentColor;
  const dot = monoColor ?? accentColor;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <title>{title}</title>

      {/* Single connected N letterform:
          1) Left stem with chamfered bottom-left corner
          2) Solid inner diagonal descending to the valley
          3) Tapered ROAD rising from the valley to the top-right waypoint */}
      <g fill={c}>
        {/* Left stem */}
        <path d="M8 8 L19 8 L19 56 L14 56 L8 50 Z" />
        {/* Inner descending diagonal (solid) */}
        <path d="M19 8 L28 8 L38 56 L30 56 Z" />
        {/* Ascending road — narrower at the top for perspective */}
        <path d="M30 56 L38 56 L53 8 L46 8 Z" />
      </g>

      {/* Dashed center lane down the road — the trucking cue */}
      <line
        x1="34"
        y1="52"
        x2="49.5"
        y2="12"
        stroke={lane}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2.8 3"
        fill="none"
      />

      {/* Waypoint / destination marker — orange node at the road's end */}
      <circle cx="49.5" cy="10.5" r="4.75" fill={dot} />
    </svg>
  );
}

/** Horizontal wordmark: mark + NAVAROAD in bold tracking. */
export function NavaroadLogo({
  className,
  size = 28,
  tone = "auto",
}: {
  className?: string;
  size?: number;
  tone?: "auto" | "light" | "dark";
}) {
  const wordColor =
    tone === "light" ? "text-black" : tone === "dark" ? "text-white" : "text-foreground";
  return (
    <div className={cn("inline-flex items-center gap-2.5", wordColor, className)}>
      <NavaroadMark size={size} />
      <span
        className="font-bold leading-none"
        style={{ fontSize: size * 0.7, letterSpacing: "0.04em" }}
      >
        NAVAROAD
      </span>
    </div>
  );
}

/** FleetOS lockup: NAVAROAD + subtle divider + FleetOS in accent weight. */
export function NavaroadFleetOSLogo({
  className,
  size = 28,
  tone = "auto",
}: {
  className?: string;
  size?: number;
  tone?: "auto" | "light" | "dark";
}) {
  const wordColor =
    tone === "light" ? "text-black" : tone === "dark" ? "text-white" : "text-foreground";
  return (
    <div className={cn("inline-flex items-center gap-2.5", wordColor, className)}>
      <NavaroadMark size={size} />
      <span
        className="font-bold leading-none"
        style={{ fontSize: size * 0.7, letterSpacing: "0.04em" }}
      >
        NAVAROAD
      </span>
      <span
        aria-hidden
        className="inline-block"
        style={{ width: 1, height: size * 0.55, background: "currentColor", opacity: 0.3 }}
      />
      <span
        className="font-medium tracking-tight leading-none text-primary"
        style={{ fontSize: size * 0.6 }}
      >
        FleetOS
      </span>
    </div>
  );
}

/** App-tile: rounded-square dark background, orange N-road inside, white waypoint. */
export function NavaroadAppTile({
  className,
  size = 64,
  radius,
}: {
  className?: string;
  size?: number;
  radius?: number;
}) {
  const r = radius ?? size * 0.22;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Navaroad app icon"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="navaroad-tile-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#111114" />
          <stop offset="100%" stopColor="#000000" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="64" height="64" rx={r} ry={r} fill="url(#navaroad-tile-bg)" />
      <rect
        x="0.5"
        y="0.5"
        width="63"
        height="63"
        rx={r - 0.5}
        ry={r - 0.5}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
      />

      {/* Inline the refined mark, scaled/inset so it fills the tile nicely */}
      <g transform="translate(6 6) scale(0.8125)">
        <g fill="#ffffff">
          <path d="M8 8 L19 8 L19 56 L14 56 L8 50 Z" />
          <path d="M19 8 L28 8 L38 56 L30 56 Z" />
          <path d="M30 56 L38 56 L53 8 L46 8 Z" />
        </g>
        <line
          x1="34"
          y1="52"
          x2="49.5"
          y2="12"
          stroke="#0b0b0f"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="2.8 3"
          fill="none"
        />
        <circle cx="49.5" cy="10.5" r="4.75" fill={ACCENT} />
      </g>
    </svg>
  );
}
