// RouteAnalysisService — geocoding + routing.
// Geocoding: Nominatim (OSM, free, fair-use).
// Routing: TomTom when configured, with graceful standard-route fallback.

export const ROUTE_NOT_CALCULATED_MESSAGE =
  "Route could not be calculated. Please check the address or try another destination.";
export const STANDARD_ROUTE_WARNING = "Standard route shown — truck restrictions not verified yet.";

export type GeoPoint = { name: string; lat: number; lon: number };
export type RoutedPath = {
  distanceKm: number;
  durationMin: number;
  geometry: Array<[number, number]>; // [lon,lat]
  provider: "TomTom" | "OSRM" | "none";
  mode: "truck" | "standard" | "unavailable";
  truckRestrictionsVerified: boolean;
  warning?: string;
  error?: string;
};

type RouteOptions = { truckMode?: boolean; waypoints?: GeoPoint[] };
type TomTomRouteMode = "truck" | "standard";

function isValidCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function unavailableRoute(detail: string): RoutedPath {
  console.warn("Routing unavailable", { detail });
  return {
    distanceKm: 0,
    durationMin: 0,
    geometry: [],
    provider: "none",
    mode: "unavailable",
    truckRestrictionsVerified: false,
    error: ROUTE_NOT_CALCULATED_MESSAGE,
  };
}

function redactTomTomKey(url: string) {
  try {
    const u = new URL(url);
    if (u.searchParams.has("key")) u.searchParams.set("key", "REDACTED_TOMTOM_API_KEY");
    return u.toString();
  } catch {
    return url.replace(/([?&]key=)[^&]+/i, "$1REDACTED_TOMTOM_API_KEY");
  }
}

function extractTomTomError(body: string) {
  try {
    const j = JSON.parse(body) as {
      detailedError?: { message?: string; code?: string };
      errorText?: string;
      message?: string;
      error?: string | { message?: string; description?: string };
    };
    if (j.detailedError?.message) return `${j.detailedError.code ?? "TomTom"}: ${j.detailedError.message}`;
    if (typeof j.error === "string") return j.error;
    if (j.error && typeof j.error === "object" && j.error.message) return j.error.message;
    if (j.error && typeof j.error === "object" && j.error.description) return j.error.description;
    return j.errorText ?? j.message ?? body.slice(0, 240);
  } catch {
    return body.slice(0, 240) || "TomTom route request failed";
  }
}

function buildTomTomRoutingUrl(key: string, o: GeoPoint, d: GeoPoint, mode: TomTomRouteMode, waypoints: GeoPoint[] = []) {
  const params = new URLSearchParams({
    traffic: "true",
    routeType: "fastest",
    computeTravelTimeFor: "all",
    key,
  });
  if (mode === "truck") params.set("travelMode", "truck");
  const all = [o, ...waypoints, d].map((p) => `${p.lat},${p.lon}`).join(":");
  return `https://api.tomtom.com/routing/1/calculateRoute/${all}/json?${params.toString()}`;
}

async function tryTomTomRoute(
  key: string,
  o: GeoPoint,
  d: GeoPoint,
  mode: TomTomRouteMode,
  waypoints: GeoPoint[] = [],
): Promise<{ ok: true; route: RoutedPath } | { ok: false; status: number; error: string; retryAsStandard: boolean }> {
  const url = buildTomTomRoutingUrl(key, o, d, mode, waypoints);
  console.info("TomTom Routing API URL", { mode, url: redactTomTomKey(url) });
  try {
    const res = await fetch(url);
    const body = await res.text();
    if (!res.ok) {
      const error = extractTomTomError(body);
      console.warn("TomTom Routing API error", { mode, status: res.status, error });
      return {
        ok: false,
        status: res.status,
        error,
        retryAsStandard: /NO_ROUTE_FOUND|ProductId|truck|not supported|unsupported/i.test(error),
      };
    }
    const j = JSON.parse(body) as {
      routes?: Array<{
        summary?: { lengthInMeters?: number; travelTimeInSeconds?: number };
        legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }>;
      }>;
    };
    const r = j.routes?.[0];
    const coords: Array<[number, number]> = [];
    for (const leg of r?.legs ?? []) for (const p of leg.points ?? []) coords.push([p.longitude, p.latitude]);
    if (!r?.summary || coords.length < 2) {
      console.warn("TomTom Routing API returned no usable route", { mode });
      return { ok: false, status: 200, error: "TomTom returned no usable route", retryAsStandard: true };
    }
    return {
      ok: true,
      route: {
        distanceKm: (r.summary.lengthInMeters ?? 0) / 1000,
        durationMin: (r.summary.travelTimeInSeconds ?? 0) / 60,
        geometry: coords,
        provider: "TomTom",
        mode,
        truckRestrictionsVerified: mode === "truck",
        warning: mode === "standard" ? STANDARD_ROUTE_WARNING : undefined,
      },
    };
  } catch (e) {
    const error = (e as Error).message;
    console.warn("TomTom Routing API request failed", { mode, error });
    return { ok: false, status: 0, error, retryAsStandard: false };
  }
}

async function tryOsrmRoute(o: GeoPoint, d: GeoPoint, truckMode: boolean, waypoints: GeoPoint[] = []): Promise<RoutedPath | null> {
  try {
    const coords = [o, ...waypoints, d].map((p) => `${p.lon},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`;
    const res = await fetch(url);
    const body = await res.text();
    if (!res.ok) {
      console.warn("Standard routing fallback failed", { status: res.status, body: body.slice(0, 240) });
      return null;
    }
    const json = JSON.parse(body) as {
      routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> } }>;
    };
    const r = json.routes?.[0];
    if (!r?.geometry?.coordinates?.length) return null;
    return {
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
      geometry: r.geometry.coordinates,
      provider: "OSRM",
      mode: "standard",
      truckRestrictionsVerified: false,
      warning: truckMode ? STANDARD_ROUTE_WARNING : undefined,
    };
  } catch (e) {
    console.warn("Standard routing fallback request failed", { error: (e as Error).message });
    return null;
  }
}

export async function geocode(query: string): Promise<GeoPoint> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Navaroad/1.0 (route-analysis)", "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error(`Geocoding service unavailable. Try again in a moment.`);
  const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!json.length) {
    throw new Error(
      `Could not find "${query}". Check the spelling and try a format like "City, ST" (e.g. "Salt Lake City, UT").`,
    );
  }
  return { name: json[0].display_name, lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon) };
}

export async function getRoute(o: GeoPoint, d: GeoPoint, options: RouteOptions = {}): Promise<RoutedPath> {
  if (!isValidCoordinate(o.lat, o.lon) || !isValidCoordinate(d.lat, d.lon)) {
    return unavailableRoute(`Invalid route coordinates: origin=${o.lat},${o.lon}; destination=${d.lat},${d.lon}`);
  }

  const waypoints = (options.waypoints ?? []).filter((w) => isValidCoordinate(w.lat, w.lon));
  // Prefer the correct TomTom Routing API endpoint. In truck mode, do not retry
  // with explicit car routing; use a clearly labeled standard route fallback.
  const key = process.env.TOMTOM_API_KEY;
  let tomtomError: string | null = null;
  if (key) {
    const primaryMode: TomTomRouteMode = options.truckMode ? "truck" : "standard";
    const primary = await tryTomTomRoute(key, o, d, primaryMode, waypoints);
    if (primary.ok) return primary.route;
    tomtomError = `${primaryMode} ${primary.status}: ${primary.error}`;

    if (options.truckMode && primary.retryAsStandard) {
      const standard = await tryTomTomRoute(key, o, d, "standard", waypoints);
      if (standard.ok) return standard.route;
      tomtomError = `truck ${primary.status}: ${primary.error}; standard ${standard.status}: ${standard.error}`;
    }
  }

  const standardRoute = await tryOsrmRoute(o, d, !!options.truckMode, waypoints);
  if (standardRoute) return standardRoute;

  return unavailableRoute(tomtomError ? `TomTom: ${tomtomError}; standard fallback failed` : "standard fallback failed");
}


/** Pick N evenly-spaced sample points along a route for weather checks. */
export function sampleRoute(
  geometry: Array<[number, number]>,
  count: number,
): Array<{ lat: number; lon: number }> {
  if (geometry.length === 0 || count <= 0) return [];
  if (geometry.length === 1) {
    const [lon, lat] = geometry[0];
    return Array.from({ length: count }, () => ({ lat, lon }));
  }
  if (count === 1) {
    const [lon, lat] = geometry[Math.floor(geometry.length / 2)];
    return [{ lat, lon }];
  }
  const out: Array<{ lat: number; lon: number }> = [];
  const lastIdx = geometry.length - 1;
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * lastIdx;
    const lo = Math.floor(t);
    const hi = Math.min(lo + 1, lastIdx);
    const frac = t - lo;
    const [lon1, lat1] = geometry[lo];
    const [lon2, lat2] = geometry[hi];
    out.push({ lat: lat1 + (lat2 - lat1) * frac, lon: lon1 + (lon2 - lon1) * frac });
  }
  return out;
}

