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

      {/* Left + right stems of the N — bold, confident, evenly weighted */}
      <g fill={c}>
        <rect x="8" y="8" width="12" height="48" rx="2.5" />
        <rect x="44" y="8" width="12" height="48" rx="2.5" />

        {/* Diagonal ROAD — a tapered ribbon connecting top-left stem to
            bottom-right stem. Slightly narrower than the stems so it reads
            as a road surface passing between them, not a filled slab. */}
        <path d="M20 8 L30 8 L44 56 L34 56 Z" />
      </g>

      {/* Dashed center lane running down the road — the trucking cue.
          Positioned along the centerline of the diagonal path above. */}
      <g
        stroke={lane}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeDasharray="3.5 4"
        fill="none"
      >
        <line x1="25" y1="12" x2="39" y2="52" />
      </g>

      {/* Waypoint / destination marker — orange node at the road's end */}
      <circle cx="50" cy="12" r="4.5" fill={dot} />
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
        <g fill={ACCENT}>
          <rect x="8" y="8" width="12" height="48" rx="2.5" />
          <rect x="44" y="8" width="12" height="48" rx="2.5" />
          <path d="M20 8 L30 8 L44 56 L34 56 Z" />
        </g>
        <g
          stroke="#ffffff"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray="3.5 4"
          fill="none"
          opacity="0.9"
        >
          <line x1="25" y1="12" x2="39" y2="52" />
        </g>
        <circle cx="50" cy="12" r="4.5" fill="#ffffff" />
      </g>
    </svg>
  );
}
