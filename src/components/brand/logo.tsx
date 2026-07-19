import { cn } from "@/lib/utils";

const LOGO_IMAGE_SRC = "/navaroad-logo.jpeg";

/** Exact uploaded Navaroad mark image. */
export function NavaroadMark({
  className,
  size = 32,
  title = "Navaroad",
}: {
  className?: string;
  size?: number;
  monoColor?: string;
  accentColor?: string;
  title?: string;
}) {
  return (
    <img
      src={LOGO_IMAGE_SRC}
      alt={title}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
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



/** App-tile: exact uploaded Navaroad mark image. */
export function NavaroadAppTile({
  className,
  size = 64,
}: {
  className?: string;
  size?: number;
  radius?: number;
}) {
  return (
    <NavaroadMark className={className} size={size} title="Navaroad app icon" />
  );
}
