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

      {/* N letterform: left stem (chamfered bottom-left) + thick descending diagonal
          + right stem (chamfered top-right). Road is cut into the diagonal. */}
      <g fill={c}>
        <path d="M8 8 L20 8 L20 56 L14 56 L8 50 Z" />
        <path d="M20 8 L32 8 L44 56 L32 56 Z" />
        <path d="M44 8 L50 8 L56 14 L56 56 L44 56 Z" />
      </g>

      {/* Road: black lane carved through the diagonal, ascending from
          bottom-left up to the waypoint at top-right. */}
      <path d="M28 54 L34 54 L52 12 L46 12 Z" fill={monoColor ? "transparent" : "#000"} />

      {/* Dashed center-lane markings */}
      <line
        x1="31"
        y1="54"
        x2="49"
        y2="12"
        stroke={monoColor ?? "#fff"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="3.2 3.2"
        fill="none"
      />

      {/* Orange waypoint dot at the top of the road */}
      <circle cx="50" cy="10" r="4.75" fill={dot} />
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
          <path d="M8 8 L20 8 L20 56 L14 56 L8 50 Z" />
          <path d="M20 8 L32 8 L44 56 L32 56 Z" />
          <path d="M44 8 L50 8 L56 14 L56 56 L44 56 Z" />
        </g>
        <path d="M28 54 L34 54 L52 12 L46 12 Z" fill="#0b0b0f" />
        <line
          x1="31" y1="54" x2="49" y2="12"
          stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3.2 3.2"
        />
        <circle cx="50" cy="10" r="4.75" fill={ACCENT} />
      </g>
    </svg>
  );
}
