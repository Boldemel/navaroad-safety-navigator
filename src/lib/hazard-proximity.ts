import { distanceMiles } from "@/hooks/use-geolocation";

export type HazardLike = {
  id: string;
  title: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  lat: number | null | undefined;
  lon: number | null | undefined;
  source: string;
  description?: string;
};

export type NearbyHazard = HazardLike & { distanceMi: number; lat: number; lon: number };

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function recommendedActionFor(h: HazardLike, distanceMi: number): string {
  const sev = (h.severity ?? "").toLowerCase();
  const cat = (h.category ?? "").toLowerCase();
  if (cat.includes("closure") || cat.includes("detour")) return "Road closure ahead — plan an alternate route now.";
  if (cat.includes("tornado") || sev === "critical")
    return "Critical hazard ahead — pull over to a safe location immediately.";
  if (cat.includes("accident")) return "Accident ahead — slow down and prepare for stopped traffic.";
  if (cat.includes("flood")) return "Flooding ahead — do not drive through standing water; reroute.";
  if (cat.includes("wind")) return "High winds ahead — reduce speed and grip the wheel firmly.";
  if (cat.includes("construction")) return "Construction zone ahead — reduce speed and watch for workers.";
  if (sev === "high") return `High-severity hazard ${distanceMi < 5 ? "very close" : "ahead"} — stay alert and reduce speed.`;
  return "Hazard nearby — stay alert and maintain safe following distance.";
}

/** Filter hazards to those within `radiusMi` of the driver, sorted nearest-first. */
export function hazardsWithin(
  origin: { lat: number; lon: number },
  hazards: HazardLike[],
  radiusMi: number,
): NearbyHazard[] {
  const out: NearbyHazard[] = [];
  for (const h of hazards) {
    if (h.lat == null || h.lon == null || !Number.isFinite(h.lat) || !Number.isFinite(h.lon)) continue;
    const d = distanceMiles(origin, { lat: h.lat, lon: h.lon });
    if (d <= radiusMi) out.push({ ...h, lat: h.lat, lon: h.lon, distanceMi: d });
  }
  return out.sort((a, b) => a.distanceMi - b.distanceMi);
}

/**
 * Bounding box of a polyline expanded by `padMi` miles. Useful for
 * "is this hazard inside the active route's bounds?" checks.
 */
export function routeBounds(
  geometry: Array<[number, number]>,
  padMi = 0,
): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  if (!geometry || geometry.length < 2) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of geometry) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const latPad = padMi / 69; // ~69 mi / deg lat
  const midLat = (minLat + maxLat) / 2;
  const lonPad = padMi / (69 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
  };
}

/** Min distance (miles) from a point to any vertex of a polyline. */
function minDistToPolyline(
  pt: { lat: number; lon: number },
  geometry: Array<[number, number]>,
): number {
  let best = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const [lat, lon] = geometry[i];
    const d = distanceMiles(pt, { lat, lon });
    if (d < best) best = d;
  }
  return best;
}

/**
 * Filter hazards to those within `corridorMi` of the active route polyline.
 * Uses a bounding-box prefilter, then per-vertex distance. Sorted by
 * distance-to-route ascending.
 */
export function hazardsAlongRoute(
  geometry: Array<[number, number]>,
  hazards: HazardLike[],
  corridorMi = 10,
): Array<NearbyHazard> {
  const bounds = routeBounds(geometry, corridorMi);
  if (!bounds) return [];
  const out: NearbyHazard[] = [];
  for (const h of hazards) {
    if (h.lat == null || h.lon == null || !Number.isFinite(h.lat) || !Number.isFinite(h.lon)) continue;
    if (h.lat < bounds.minLat || h.lat > bounds.maxLat || h.lon < bounds.minLon || h.lon > bounds.maxLon) continue;
    const d = minDistToPolyline({ lat: h.lat, lon: h.lon }, geometry);
    if (d <= corridorMi) out.push({ ...h, lat: h.lat, lon: h.lon, distanceMi: d });
  }
  return out.sort((a, b) => a.distanceMi - b.distanceMi);
}

/**
 * Compute the alert payload a voice-alert layer would speak: the nearest
 * hazard, its distance, severity, and a recommended action.
 */
export function nearestHazardAlert(
  origin: { lat: number; lon: number } | null,
  hazards: HazardLike[],
): {
  hazard: NearbyHazard;
  distanceMi: number;
  severity: string;
  recommendedAction: string;
  speakable: string;
} | null {
  if (!origin) return null;
  const nearby = hazardsWithin(origin, hazards, 100);
  if (nearby.length === 0) return null;
  // Prefer nearest within 25mi, but boost severity for ties.
  const close = nearby.filter((h) => h.distanceMi <= 25);
  const pool = close.length ? close : nearby.slice(0, 1);
  pool.sort((a, b) => {
    const sevDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (Math.abs(a.distanceMi - b.distanceMi) < 2) return sevDiff;
    return a.distanceMi - b.distanceMi;
  });
  const top = pool[0];
  const action = recommendedActionFor(top, top.distanceMi);
  const dist = top.distanceMi < 1 ? "less than a mile" : `${Math.round(top.distanceMi)} miles`;
  return {
    hazard: top,
    distanceMi: top.distanceMi,
    severity: top.severity,
    recommendedAction: action,
    speakable: `${top.severity.toUpperCase()} ${top.title} ${dist} ahead. ${action}`,
  };
}
