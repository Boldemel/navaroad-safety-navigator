// Pure utilities for computing live progress along an active route.
// Geometry is [lon, lat] segments (matching ActiveRoute).

export type LatLon = { lat: number; lon: number };

const R_MI = 3958.7613;

export function haversineMi(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Cumulative distance (mi) along the geometry to each vertex. */
export function cumulativeMiles(geometry: Array<[number, number]>): number[] {
  const out = new Array(geometry.length).fill(0);
  for (let i = 1; i < geometry.length; i++) {
    const [lonA, latA] = geometry[i - 1];
    const [lonB, latB] = geometry[i];
    out[i] = out[i - 1] + haversineMi({ lat: latA, lon: lonA }, { lat: latB, lon: lonB });
  }
  return out;
}

export type RouteProgress = {
  totalMi: number;
  traveledMi: number;
  remainingMi: number;
  percent: number; // 0..100
  nearestIndex: number;
  offRouteMi: number;
  etaMin: number | null; // null when no speed known
  etaAt: string | null; // ISO time
};

/**
 * Project the driver onto the geometry to compute traveled/remaining miles.
 * speedMph (current GPS speed) drives the ETA; pass null to skip ETA.
 */
export function computeProgress(
  geometry: Array<[number, number]>,
  here: LatLon | null,
  speedMph: number | null,
): RouteProgress | null {
  if (geometry.length < 2) return null;
  const cum = cumulativeMiles(geometry);
  const totalMi = cum[cum.length - 1];
  if (!here) {
    return { totalMi, traveledMi: 0, remainingMi: totalMi, percent: 0, nearestIndex: 0, offRouteMi: 0, etaMin: null, etaAt: null };
  }
  // Find nearest vertex (good enough at typical geometry density).
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const [lon, lat] = geometry[i];
    const d = haversineMi(here, { lat, lon });
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  const traveledMi = Math.min(totalMi, cum[bestIdx]);
  const remainingMi = Math.max(0, totalMi - traveledMi);
  const percent = totalMi > 0 ? Math.min(100, Math.max(0, (traveledMi / totalMi) * 100)) : 0;
  const usableSpeed = speedMph != null && speedMph >= 5 ? speedMph : null;
  const etaMin = usableSpeed ? (remainingMi / usableSpeed) * 60 : null;
  const etaAt = etaMin != null ? new Date(Date.now() + etaMin * 60_000).toISOString() : null;
  return { totalMi, traveledMi, remainingMi, percent, nearestIndex: bestIdx, offRouteMi: bestD, etaMin, etaAt };
}

/** Items ahead of the driver along the route, sorted by route distance. */
export function aheadOnRoute<T extends LatLon>(
  geometry: Array<[number, number]>,
  here: LatLon | null,
  items: T[],
  corridorMi = 10,
): Array<T & { distanceAheadMi: number; offRouteMi: number }> {
  if (geometry.length < 2 || here == null) return [];
  const cum = cumulativeMiles(geometry);
  // Driver's position along route
  let driverIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const [lon, lat] = geometry[i];
    const d = haversineMi(here, { lat, lon });
    if (d < bestD) { bestD = d; driverIdx = i; }
  }
  const driverMi = cum[driverIdx];

  const out: Array<T & { distanceAheadMi: number; offRouteMi: number }> = [];
  for (const it of items) {
    let nearIdx = 0;
    let nearD = Infinity;
    for (let i = 0; i < geometry.length; i++) {
      const [lon, lat] = geometry[i];
      const d = haversineMi(it, { lat, lon });
      if (d < nearD) { nearD = d; nearIdx = i; }
    }
    if (nearD > corridorMi) continue;
    const ahead = cum[nearIdx] - driverMi;
    if (ahead < -0.25) continue; // skip points behind
    out.push({ ...it, distanceAheadMi: Math.max(0, ahead), offRouteMi: nearD });
  }
  out.sort((a, b) => a.distanceAheadMi - b.distanceAheadMi);
  return out;
}

export function kmh(speedMps: number | null): number | null {
  return speedMps == null ? null : speedMps * 3.6;
}
export function mph(speedMps: number | null): number | null {
  return speedMps == null ? null : speedMps * 2.236936;
}

export function formatEta(etaAt: string | null): string {
  if (!etaAt) return "—";
  const d = new Date(etaAt);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
export function formatMin(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}
