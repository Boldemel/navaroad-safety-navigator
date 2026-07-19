/**
 * Navaroad brand system — SVG logos.
 *
 * Rork-portable: pure JSX, no browser-only APIs. When ported to React Native,
 * swap `svg` primitives via react-native-svg (Svg, Rect, Circle, Path, G) —
 * the component structure and props map 1:1.
 */
import { cn } from "@/lib/utils";

/** Core geometric "N with waypoint" mark. Scales cleanly from 16px to 1024px. */
export function NavaroadMark({
  className,
  size = 32,
  monoColor,
  accentColor = "hsl(24 95% 55%)",
  title = "Navaroad",
}: {
  className?: string;
  size?: number;
  /** If set, renders monochrome (dot uses same color). Else uses currentColor + accent dot. */
  monoColor?: string;
  accentColor?: string;
  title?: string;
}) {
  const bar = monoColor ?? "currentColor";
  const dot = monoColor ?? accentColor;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <title>{title}</title>
      {/* Rounded square backdrop is optional — we draw only the mark for maximum reuse.
          The "N" is built from two vertical bars + a diagonal stroke. */}
      <g fill={bar}>
        {/* Left bar */}
        <rect x="4" y="4" width="6" height="24" rx="1.5" />
        {/* Right bar */}
        <rect x="22" y="4" width="6" height="24" rx="1.5" />
        {/* Diagonal (parallelogram from top of left bar to bottom of right bar) */}
        <path d="M10 4 L16 4 L22 28 L16 28 Z" />
      </g>
      {/* Waypoint node — orange accent, top-right terminal */}
      <circle cx="27.5" cy="5" r="3.25" fill={dot} stroke="hsl(0 0% 0%)" strokeWidth="0.75" />
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
  /** 'auto' inherits currentColor. 'light' = black wordmark. 'dark' = white wordmark. */
  tone?: "auto" | "light" | "dark";
}) {
  const wordColor =
    tone === "light" ? "text-black" : tone === "dark" ? "text-white" : "text-foreground";
  return (
    <div className={cn("inline-flex items-center gap-2.5", wordColor, className)}>
      <NavaroadMark size={size} />
      <span
        className="font-bold tracking-[-0.01em] leading-none"
        style={{ fontSize: size * 0.72, letterSpacing: "0.02em" }}
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
        className="font-bold tracking-[-0.01em] leading-none"
        style={{ fontSize: size * 0.72, letterSpacing: "0.02em" }}
      >
        NAVAROAD
      </span>
      <span
        aria-hidden
        className="inline-block bg-current/30"
        style={{ width: 1, height: size * 0.55, opacity: 0.35 }}
      />
      <span
        className="font-medium tracking-tight leading-none text-primary"
        style={{ fontSize: size * 0.62 }}
      >
        FleetOS
      </span>
    </div>
  );
}

/** App-tile version of the mark: rounded-square with dark background, orange N inside. */
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
      {/* subtle inner highlight */}
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
      {/* Mark scaled 2x inside the tile */}
      <g transform="translate(8 8) scale(1.5)" fill="hsl(24 95% 55%)">
        <rect x="4" y="4" width="6" height="24" rx="1.5" />
        <rect x="22" y="4" width="6" height="24" rx="1.5" />
        <path d="M10 4 L16 4 L22 28 L16 28 Z" />
      </g>
      <circle cx="49" cy="15" r="4.5" fill="#ffffff" />
    </svg>
  );
}
