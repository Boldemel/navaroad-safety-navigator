/**
 * Navaroad — 5 refined variations of Concept #2 (Road Monogram N).
 * All designed on a 64×64 grid, monochrome-safe (currentColor), with
 * optional orange waypoint accent. Rork-portable (pure SVG primitives).
 */
import { cn } from "@/lib/utils";

const ORANGE = "hsl(24 95% 55%)";

type MarkProps = {
  className?: string;
  size?: number;
  monoColor?: string;
  accentColor?: string;
  title?: string;
};

function Frame({
  size = 64,
  className,
  title,
  children,
}: {
  size?: number;
  className?: string;
  title: string;
  children: React.ReactNode;
}) {
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
      {children}
    </svg>
  );
}

/** V1 — Bold Geometric N. Chunky stems, integrated diagonal road, subtle waypoint. */
export function MarkV1({ className, size, monoColor, accentColor = ORANGE, title = "Navaroad V1" }: MarkProps) {
  const c = monoColor ?? "currentColor";
  const dot = monoColor ?? accentColor;
  return (
    <Frame size={size} className={className} title={title}>
      <g fill={c}>
        <rect x="8" y="8" width="12" height="48" rx="2" />
        <rect x="44" y="8" width="12" height="48" rx="2" />
        <path d="M20 8 L32 8 L44 56 L32 56 Z" />
      </g>
      <circle cx="50" cy="14" r="5" fill={dot} />
    </Frame>
  );
}

/** V2 — Road-Cut N. Diagonal is a road with a centered dashed lane line. */
export function MarkV2({ className, size, monoColor, accentColor = ORANGE, title = "Navaroad V2" }: MarkProps) {
  const c = monoColor ?? "currentColor";
  const lane = monoColor ?? accentColor;
  return (
    <Frame size={size} className={className} title={title}>
      <g fill={c}>
        <rect x="8" y="8" width="11" height="48" rx="2" />
        <rect x="45" y="8" width="11" height="48" rx="2" />
        <path d="M19 8 L30 8 L45 56 L34 56 Z" />
      </g>
      {/* Dashed lane line running along the diagonal */}
      <g stroke={lane} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" fill="none">
        <line x1="24.5" y1="12" x2="39.5" y2="52" />
      </g>
    </Frame>
  );
}

/** V3 — Chevron N. Diagonal terminates in an upward chevron/arrow (forward motion). */
export function MarkV3({ className, size, monoColor, accentColor = ORANGE, title = "Navaroad V3" }: MarkProps) {
  const c = monoColor ?? "currentColor";
  const dot = monoColor ?? accentColor;
  return (
    <Frame size={size} className={className} title={title}>
      <g fill={c}>
        <rect x="8" y="8" width="11" height="48" rx="2" />
        <rect x="45" y="8" width="11" height="48" rx="2" />
        {/* Diagonal that arrow-points at top-right */}
        <path d="M19 8 L34 8 L45 56 L30 56 Z" />
        {/* Chevron notch cut at top-right corner reads as an arrowhead */}
        <path d="M45 8 L56 8 L50.5 20 Z" />
      </g>
      <circle cx="50.5" cy="14" r="3" fill={dot} />
    </Frame>
  );
}

/** V4 — Horizon N. Right stem shortened to imply road vanishing to horizon; waypoint on top. */
export function MarkV4({ className, size, monoColor, accentColor = ORANGE, title = "Navaroad V4" }: MarkProps) {
  const c = monoColor ?? "currentColor";
  const dot = monoColor ?? accentColor;
  return (
    <Frame size={size} className={className} title={title}>
      <g fill={c}>
        <rect x="8" y="8" width="12" height="48" rx="2" />
        <rect x="44" y="14" width="12" height="42" rx="2" />
        {/* Road-like tapered diagonal — wider at base, narrower at horizon */}
        <path d="M20 8 L28 8 L44 56 L32 56 Z" />
      </g>
      <circle cx="50" cy="10" r="4.5" fill={dot} />
    </Frame>
  );
}

/** V5 — Minimal Monoline N. Single-weight strokes, timeless enterprise feel. */
export function MarkV5({ className, size, monoColor, accentColor = ORANGE, title = "Navaroad V5" }: MarkProps) {
  const c = monoColor ?? "currentColor";
  const dot = monoColor ?? accentColor;
  return (
    <Frame size={size} className={className} title={title}>
      <g fill="none" stroke={c} strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter">
        <line x1="12" y1="8" x2="12" y2="56" />
        <line x1="52" y1="8" x2="52" y2="56" />
        <line x1="12" y1="10" x2="52" y2="54" />
      </g>
      <circle cx="52" cy="10" r="5" fill={dot} />
    </Frame>
  );
}

export const LOGO_VARIATIONS = [
  { id: "v1", name: "Bold Geometric", component: MarkV1, note: "Chunky stems, confident, banking-grade." },
  { id: "v2", name: "Road Lane", component: MarkV2, note: "Diagonal is a road with dashed lane markers." },
  { id: "v3", name: "Chevron Forward", component: MarkV3, note: "Arrowhead notch signals motion & direction." },
  { id: "v4", name: "Horizon", component: MarkV4, note: "Right stem drops to imply road vanishing point." },
  { id: "v5", name: "Monoline Minimal", component: MarkV5, note: "Single-weight strokes, timeless SaaS." },
] as const;
