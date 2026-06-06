import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Strict truck-stop brands. Fuel stations are kept separate from truck stops.
const TRUCK_STOP_BRANDS = [
  "Pilot",
  "Flying J",
  "Loves",
  "Love's",
  "TA",
  "TravelCenters",
  "Petro",
];

const RouteGeometry = z.preprocess((value) => {
  if (!Array.isArray(value)) return value;
  if (value.length <= 2000) return value;
  const sampled: unknown[] = [];
  for (let i = 0; i < 2000; i++) {
    sampled.push(value[Math.floor((i / 1999) * (value.length - 1))]);
  }
  return sampled;
}, z.array(z.tuple([z.number(), z.number()])));

const Input = z.object({
  geometry: RouteGeometry,
  kind: z.enum(["fuel", "parking", "truck_stop", "weigh_station"]),
  limit: z.number().int().min(1).max(100).optional(),
});

export type TruckPoiType = "fuel" | "truck_stop" | "rest_area" | "parking" | "weigh_station";

export type TruckPoiSource = "TomTom" | "OpenStreetMap";

// Truck-routing restriction placeholder (future implementation).
// Populated as null today; reserved for low-bridge, weight, hazmat, prohibited road,
// and state truck-route attribution once the truck-routing layer is connected.
export type TruckRestrictionInfo = {
  lowBridgeFt?: number | null;
  maxWeightLbs?: number | null;
  hazmatAllowed?: boolean | null;
  truckProhibited?: boolean | null;
  stateTruckRoute?: string | null;
};

export type TruckPoi = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  type: TruckPoiType;
  address: string;
  city: string | null;
  state: string | null;
  lat: number;
  lon: number;
  distanceMi?: number | null;
  routeProgressMi?: number | null;
  phone?: string | null;
  source: TruckPoiSource;
  restrictions?: TruckRestrictionInfo | null;
};

export type TruckPoiResult = {
  connected: boolean;
  provider: string;
  message?: string;
  totalFound: number;
  debug?: {
    routeUsed: string;
    routePointCount: number;
    searchPointCount: number;
    corridorRadiusMi: number;
    rawResultsCount: number;
    routeFilteredResultsCount: number;
    deduplicatedResultsCount: number;
    finalDisplayedCount: number;
    filteredResultsCount: number;
    filteredOutCount: number;
    searchingFullRoute: boolean;
    rawTomTomResults: string[];
    routeFilteredResults: string[];
    finalDisplayedResults: string[];
  };
  pois: TruckPoi[];
};

// Haversine distance in miles.
function distMi(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// Cumulative miles -> sample every ~stepMi along the route, plus origin + dest.
function sampleEveryMiles(
  geom: Array<[number, number]>,
  stepMi: number,
  maxSamples: number,
): Array<{ lat: number; lon: number }> {
  if (geom.length === 0) return [];
  const pts: Array<{ lat: number; lon: number; cum: number }> = [];
  let cum = 0;
  pts.push({ lon: geom[0][0], lat: geom[0][1], cum: 0 } as never);
  for (let i = 1; i < geom.length; i++) {
    const [lon1, lat1] = geom[i - 1];
    const [lon2, lat2] = geom[i];
    cum += distMi(lat1, lon1, lat2, lon2);
    pts.push({ lon: lon2, lat: lat2, cum });
  }
  const total = cum;
  const targetCount = Math.min(maxSamples, Math.max(2, Math.ceil(total / stepMi) + 1));
  const samples: Array<{ lat: number; lon: number }> = [];
  let idx = 0;
  for (let i = 0; i < targetCount; i++) {
    const target = targetCount === 1 ? 0 : (i / (targetCount - 1)) * total;
    while (idx < pts.length - 1 && pts[idx + 1].cum < target) idx++;
    const p = pts[idx];
    samples.push({ lat: p.lat, lon: p.lon });
  }
  return samples;
}

function classify(
  name: string,
  brand: string | null,
  categories: string[],
  fallback: TruckPoiType = "fuel",
): TruckPoiType {
  const hay = `${name} ${brand ?? ""} ${categories.join(" ")}`.toLowerCase();
  if (TRUCK_STOP_BRANDS.some((b) => hay.includes(b.toLowerCase()))) return "truck_stop";
  if (/truck stop|travel center|travel centre|truckstop|truck plaza/.test(hay)) return "truck_stop";
  if (/weigh station|weigh-in-motion|inspection station|port of entry|cat scale/.test(hay)) return "weigh_station";
  if (/rest area|rest stop/.test(hay)) return "rest_area";
  if (/diesel|fuel|gas station|petrol|gasoline/.test(hay)) return "fuel";
  if (/parking/.test(hay)) return "parking";
  return fallback;
}

// Brands / keywords that indicate EV charging — excluded from Fuel Stops.
function isEvCharging(hay: string) {
  return /\bev\b|electric vehicle|charging station|supercharger|tesla|chargepoint|charge\s*point|electrify america|blink charging|\bblink\b(?!\s*charging)?|evgo|ev-go|wattstation|wattzilla|greenlots|semaconnect|flo charging|volta charging/.test(hay);
}

function isWeighStationStrict(hay: string) {
  if (truckStopAllowed(hay)) return false;
  return /weigh\s*station|weigh-in-motion|truck\s*inspection|inspection\s*station|port\s*of\s*entry|cat\s*scale|dot\s*scale|scale\s*house/.test(hay);
}


function pointToSegmentDistanceMi(
  lat: number,
  lon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
) {
  const milesPerDegreeLat = 69;
  const milesPerDegreeLon = 69 * Math.cos((lat * Math.PI) / 180);
  const px = lon * milesPerDegreeLon;
  const py = lat * milesPerDegreeLat;
  const ax = aLon * milesPerDegreeLon;
  const ay = aLat * milesPerDegreeLat;
  const bx = bLon * milesPerDegreeLon;
  const by = bLat * milesPerDegreeLat;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return distMi(lat, lon, aLat, aLon);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function distanceToRouteMi(geom: Array<[number, number]>, lat: number, lon: number) {
  let best = Infinity;
  for (let i = 1; i < geom.length; i++) {
    const [aLon, aLat] = geom[i - 1];
    const [bLon, bLat] = geom[i];
    best = Math.min(best, pointToSegmentDistanceMi(lat, lon, aLat, aLon, bLat, bLon));
  }
  if (geom.length === 1) best = distMi(lat, lon, geom[0][1], geom[0][0]);
  return Number.isFinite(best) ? best : null;
}

// Precompute cumulative miles along the route polyline.
function buildCumMi(geom: Array<[number, number]>): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < geom.length; i++) {
    const [aLon, aLat] = geom[i - 1];
    const [bLon, bLat] = geom[i];
    cum.push(cum[i - 1] + distMi(aLat, aLon, bLat, bLon));
  }
  return cum;
}

// Project (lat,lon) onto the route and return cumulative miles from origin
// to the closest point on the route (route progression). Also returns the
// perpendicular distance to the route.
function projectOnRouteMi(
  geom: Array<[number, number]>,
  cumMi: number[],
  lat: number,
  lon: number,
): { perpMi: number; progressMi: number } | null {
  let bestPerp = Infinity;
  let bestProgress = 0;
  for (let i = 1; i < geom.length; i++) {
    const [aLon, aLat] = geom[i - 1];
    const [bLon, bLat] = geom[i];
    const milesPerDegLat = 69;
    const milesPerDegLon = 69 * Math.cos((lat * Math.PI) / 180);
    const px = lon * milesPerDegLon;
    const py = lat * milesPerDegLat;
    const ax = aLon * milesPerDegLon;
    const ay = aLat * milesPerDegLat;
    const bx = bLon * milesPerDegLon;
    const by = bLat * milesPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    let t = 0;
    let perp: number;
    if (dx === 0 && dy === 0) {
      perp = Math.hypot(px - ax, py - ay);
    } else {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      perp = Math.hypot(px - cx, py - cy);
    }
    if (perp < bestPerp) {
      bestPerp = perp;
      const segLen = cumMi[i] - cumMi[i - 1];
      bestProgress = cumMi[i - 1] + t * segLen;
    }
  }
  if (!Number.isFinite(bestPerp)) return null;
  return { perpMi: bestPerp, progressMi: bestProgress };
}


function tomtomError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const j = payload as {
    errorText?: string;
    message?: string;
    error?: { description?: string; message?: string } | string;
    detailedError?: { message?: string; code?: string };
  };
  if (j.detailedError?.message) return j.detailedError.message;
  if (typeof j.error === "string") return j.error;
  if (j.error?.description) return j.error.description;
  if (j.error?.message) return j.error.message;
  return j.errorText ?? j.message ?? null;
}

function redactTomTomKey(url: string, key: string) {
  return url.replace(key, "REDACTED_TOMTOM_API_KEY");
}

type RawResult = {
  id?: string;
  poi?: { name?: string; brands?: Array<{ name: string }>; phone?: string; categories?: string[] };
  address?: {
    freeformAddress?: string;
    municipality?: string;
    countrySubdivision?: string;
    countrySubdivisionName?: string;
  };
  position?: { lat: number; lon: number };
  dist?: number;
};

type TomTomCall = {
  url: string;
  status: number;
  error: string | null;
  results: RawResult[];
};

function truckStopAllowed(hay: string) {
  return (
    /\bpilot\b/.test(hay) ||
    /flying\s*j/.test(hay) ||
    /love'?s/.test(hay) ||
    /\bta\b/.test(hay) ||
    /\bpetro\b/.test(hay) ||
    /travel\s*cent(er|re)s?/.test(hay) ||
    /truck\s*plaza/.test(hay) ||
    /truck\s*stop|truckstop/.test(hay)
  );
}

async function tomtomNearby(
  key: string,
  lat: number,
  lon: number,
  categorySet: string,
  radiusM: number,
): Promise<TomTomCall> {
  const p = new URLSearchParams({
    key,
    lat: String(lat),
    lon: String(lon),
    radius: String(radiusM),
    limit: "50",
    categorySet,
  });
  const url = `https://api.tomtom.com/search/2/nearbySearch/.json?${p}`;
  try {
    const r = await fetch(url);
    const j = (await r.json().catch(() => null)) as { results?: RawResult[] } | null;
    return { url, status: r.status, error: r.ok ? null : tomtomError(j), results: r.ok ? j?.results ?? [] : [] };
  } catch {
    return { url, status: 0, error: "TomTom request failed", results: [] };
  }
}

async function tomtomKeyword(
  key: string,
  query: string,
  lat: number,
  lon: number,
  radiusM: number,
): Promise<TomTomCall> {
  const p = new URLSearchParams({
    key,
    lat: String(lat),
    lon: String(lon),
    radius: String(radiusM),
    limit: "50",
    idxSet: "POI",
  });
  const url = `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(query)}.json?${p}`;
  try {
    const r = await fetch(url);
    const j = (await r.json().catch(() => null)) as { results?: RawResult[] } | null;
    return { url, status: r.status, error: r.ok ? null : tomtomError(j), results: r.ok ? j?.results ?? [] : [] };
  } catch {
    return { url, status: 0, error: "TomTom request failed", results: [] };
  }
}


export const searchTruckPois = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<TruckPoiResult> => {
    const key = process.env.TOMTOM_API_KEY;
    if (!key) {
      return {
        connected: false,
        provider: "not_connected",
        totalFound: 0,
        message: "POI provider not connected yet.",
        pois: [],
      };
    }
    if (data.geometry.length < 2) {
      return { connected: true, provider: "TomTom", totalFound: 0, pois: [] };
    }

    // Sample every ~100 miles along the route corridor (cap 15 samples to bound API calls).
    const samples = sampleEveryMiles(data.geometry, 100, 15);

    // TomTom POI categories:
    // 7311 = Truck Stop / Travel Center, 7311003 = Truck-friendly fuel,
    // 7395 = Rest Area, 7369 = Open Parking Area, 7309 = Petrol/Gasoline Station,
    // 7314 = Weigh Station / Truck inspection.
    const categorySet =
      data.kind === "fuel" ? "7311003,7309"
      : data.kind === "truck_stop" ? "7311,7311003"
      : data.kind === "weigh_station" ? "7314"
      : "7311,7395,7369";

    const keywords =
      data.kind === "fuel"
        ? ["diesel", "fuel station", "gas station"]
      : data.kind === "truck_stop"
        ? ["truck stop", "travel center", "Pilot", "Flying J", "Loves", "TA", "Petro"]
      : data.kind === "weigh_station"
        ? ["weigh station", "truck inspection", "port of entry"]
        : ["truck stop", "rest area", "travel center", "truck parking"];

    const radiusM = 50000; // initial provider search around each sample
    const corridorRadiusMi = 35; // final route-corridor filter for simplified route geometry
    const seen = new Map<string, TruckPoi>();
    let tomtomRawCount = 0;
    let routeFilteredCount = 0;
    let tomtomFilteredCount = 0;
    const rawTomTomResults: string[] = [];
    const routeFilteredResults: string[] = [];

    const addRaw = (r: RawResult, sampleLat: number, sampleLon: number) => {
      if (!r.position) return;
      tomtomRawCount += 1;
      const brand = r.poi?.brands?.[0]?.name ?? null;
      const name = r.poi?.name ?? brand ?? "Truck stop";
      const cats = r.poi?.categories ?? [];
      if (rawTomTomResults.length < 12) rawTomTomResults.push(`${name} · ${cats[0] ?? "uncategorized"}`);
      const fallbackType: TruckPoiType =
        data.kind === "weigh_station" ? "weigh_station"
        : data.kind === "parking" ? "parking"
        : data.kind === "truck_stop" ? "truck_stop"
        : "fuel";
      const type = classify(name, brand, cats, fallbackType);
      if (data.kind === "fuel") {
        // Fuel includes branded truck stops (Pilot/Flying J/Love's/TA/Petro all sell diesel)
        // plus any classified fuel station. Exclude rest areas, parking, weigh stations.
        const hay = `${name} ${brand ?? ""} ${cats.join(" ")}`.toLowerCase();
        const isFuel = type === "fuel" || type === "truck_stop" || truckStopAllowed(hay);
        if (!isFuel) {
          tomtomFilteredCount += 1;
          return;
        }
      }
      if (data.kind === "parking") {
        // Only show truck-relevant parking: brand truck stops, rest areas,
        // travel centers, truck plazas, or named truck parking.
        const hay = `${name} ${brand ?? ""} ${cats.join(" ")}`.toLowerCase();
        const isTruckParking =
          (type === "truck_stop" && truckStopAllowed(hay)) ||
          type === "rest_area" ||
          truckStopAllowed(hay) ||
          /truck\s*parking/.test(hay);
        if (!isTruckParking) {
          tomtomFilteredCount += 1;
          return;
        }
      }
      if (data.kind === "truck_stop") {
        // Strict allow-list: only major truck-stop chains + generic truck plazas.
        const hay = `${name} ${brand ?? ""} ${cats.join(" ")}`.toLowerCase();
        const isAllowedTruckStop = truckStopAllowed(hay);
        if (!isAllowedTruckStop) {
          tomtomFilteredCount += 1;
          return;
        }
      }
      if (data.kind === "weigh_station" && type !== "weigh_station") {
        tomtomFilteredCount += 1;
        return;
      }

      const routeDistance = distanceToRouteMi(data.geometry, r.position.lat, r.position.lon);
      if (routeDistance == null || routeDistance > corridorRadiusMi) {
        tomtomFilteredCount += 1;
        return;
      }
      routeFilteredCount += 1;
      if (routeFilteredResults.length < 12) routeFilteredResults.push(`${name} · ${routeDistance.toFixed(1)} mi`);
      const id = r.id ?? `${r.position.lat.toFixed(5)},${r.position.lon.toFixed(5)}`;
      const existing = seen.get(id);
      if (existing) {
        if ((existing.distanceMi ?? Infinity) > routeDistance) existing.distanceMi = routeDistance;
        return;
      }
      seen.set(id, {
        id,
        name,
        brand,
        category: cats[0] ?? type,
        type,
        address: r.address?.freeformAddress ?? "",
        city: r.address?.municipality ?? null,
        state: r.address?.countrySubdivision ?? r.address?.countrySubdivisionName ?? null,
        lat: r.position.lat,
        lon: r.position.lon,
        distanceMi: routeDistance,
        phone: r.poi?.phone ?? null,
        source: "TomTom",
      });
    };

    // Step 1: category search at every sample, in parallel.
    const categoryResults = await Promise.all(
      samples.map((s) => tomtomNearby(key, s.lat, s.lon, categorySet, radiusM)),
    );
    samples.forEach((s, i) => categoryResults[i].results.forEach((r) => addRaw(r, s.lat, s.lon)));

    // Step 2: keyword fallback — run if category search yielded few results, or always for
    // brand-name coverage (truck-friendly fuel chains often miscategorize).
    if (seen.size < 10) {
      const keywordCalls: Array<Promise<TomTomCall>> = [];
      const keywordSamples: Array<{ lat: number; lon: number }> = [];
      for (const s of samples) {
        for (const kw of keywords) {
          keywordCalls.push(tomtomKeyword(key, kw, s.lat, s.lon, radiusM));
          keywordSamples.push(s);
        }
      }
      const kwResults = await Promise.all(keywordCalls);
      kwResults.forEach((call, i) =>
        call.results.forEach((r) => addRaw(r, keywordSamples[i].lat, keywordSamples[i].lon)),
      );
    }

    const tomtomCalls = [...categoryResults];
    const firstError = tomtomCalls.find((c) => c.error)?.error ?? null;
    const firstFuelUrl = redactTomTomKey(categoryResults[0]?.url ?? "", key);
    console.info("Navaroad TomTom POI diagnostics", {
      kind: data.kind,
      keyRead: true,
      keyLength: key.length,
      firstUrl: firstFuelUrl,
      routePointCount: data.geometry.length,
      sampleCount: samples.length,
      searchesFullRoute: samples.length > 1,
      corridorRadiusMi,
      rawTomTomCount: tomtomRawCount,
      filteredResultsCount: seen.size,
      filteredOutAfterTomTom: tomtomFilteredCount,
      firstTomTomStatus: categoryResults[0]?.status,
      firstTomTomError: firstError,
    });

    let pois = Array.from(seen.values()).sort(
      (a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity),
    );
    let provider = "TomTom";
    let message =
      data.kind === "parking" && pois.length > 0
        ? "Parking locations found. Live availability not connected."
        : undefined;

    if (pois.length === 0) {
      message = firstError
        ? `TomTom Search returned: ${firstError}. No locations found along the route.`
        : "No TomTom locations found along the route corridor.";
    }


    const deduplicatedCount = pois.length;
    const displayedPois = pois.slice(0, data.limit ?? 60);
    const totalFound = displayedPois.length;
    const routeStart = data.geometry[0];
    const routeEnd = data.geometry[data.geometry.length - 1];
    const debug = {
      routeUsed: `${routeStart[1].toFixed(4)}, ${routeStart[0].toFixed(4)} → ${routeEnd[1].toFixed(4)}, ${routeEnd[0].toFixed(4)}`,
      routePointCount: data.geometry.length,
      searchPointCount: samples.length,
      corridorRadiusMi,
      rawResultsCount: tomtomRawCount,
      routeFilteredResultsCount: routeFilteredCount,
      deduplicatedResultsCount: deduplicatedCount,
      finalDisplayedCount: displayedPois.length,
      filteredResultsCount: deduplicatedCount,
      filteredOutCount: tomtomFilteredCount,
      searchingFullRoute: samples.length > 1,
      rawTomTomResults,
      routeFilteredResults,
      finalDisplayedResults: displayedPois.slice(0, 12).map((p) => `${p.name} · ${p.distanceMi != null ? p.distanceMi.toFixed(1) : "?"} mi`),
    };

    return {
      connected: true,
      provider,
      message,
      totalFound,
      debug,
      pois: displayedPois,
    };
  });
