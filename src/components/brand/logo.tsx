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

      {/* Full N letterform with chamfered outer corners (top-left & bottom-right) */}
      <g fill={c}>
        {/* Left stem: chamfered top-left */}
        <path d="M8 14 L14 8 L22 8 L22 56 L8 56 Z" />
        {/* Descending diagonal from top of left stem to bottom of right stem */}
        <path d="M22 8 L32 8 L52 56 L42 56 Z" />
        {/* Right stem: chamfered bottom-right */}
        <path d="M42 8 L56 8 L56 50 L50 56 L42 56 Z" />
      </g>

      {/* Road cut into the upper-right cavity: two parallel edges + dashed centerline,
          climbing from the base up to the orange waypoint. */}
      <g stroke={lane} fill="none" strokeLinecap="round">
        {/* Road outer edges (subtle) */}
        <line x1="34" y1="54" x2="47" y2="16" strokeWidth="1.1" opacity="0.55" />
        <line x1="40" y1="54" x2="53" y2="16" strokeWidth="1.1" opacity="0.55" />
        {/* Dashed center lane */}
        <line
          x1="37"
          y1="54"
          x2="50"
          y2="16"
          strokeWidth="1.6"
          strokeDasharray="3 3"
        />
      </g>

      {/* Orange waypoint dot at the top of the right stem */}
      <circle cx="50.5" cy="10.5" r="4.75" fill={dot} />
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
          <path d="M19 8 L28 8 L52 56 L44 56 Z" />
          <path d="M45 8 L56 8 L56 56 L45 56 Z" />
        </g>
        <line
          x1="30"
          y1="52"
          x2="46"
          y2="14"
          stroke="#0b0b0f"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="3 3.2"
          fill="none"
        />
        <circle cx="50.5" cy="10.5" r="4.75" fill={ACCENT} />

      </g>
    </svg>
  );
}
