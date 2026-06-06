import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Truck-friendly brands we boost / surface explicitly.
const TRUCK_FUEL_BRANDS = [
  "Pilot",
  "Flying J",
  "Loves",
  "Love's",
  "TA",
  "TravelCenters",
  "Petro",
  "Sapp Bros",
  "AmBest",
  "Speedway",
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
  phone?: string | null;
  source: TruckPoiSource;
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
    filteredResultsCount: number;
    filteredOutCount: number;
    searchingFullRoute: boolean;
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
  if (/weigh station|weigh-in-motion|inspection station|port of entry/.test(hay)) return "weigh_station";
  if (/rest area|rest stop/.test(hay)) return "rest_area";
  if (/truck stop|travel center|travel centre|truckstop/.test(hay)) return "truck_stop";
  if (TRUCK_FUEL_BRANDS.some((b) => hay.includes(b.toLowerCase()))) return "truck_stop";
  if (/diesel|fuel|gas station|petrol|gasoline/.test(hay)) return "fuel";
  if (/parking/.test(hay)) return "parking";
  return fallback;

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
        message:
          data.kind === "fuel"
            ? "Fuel stop data not connected yet."
            : "Live truck parking availability not connected yet.",
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
    // 7395 = Rest Area, 7369 = Open Parking Area, 7309 = Petrol/Gasoline Station.
    const categorySet =
      data.kind === "fuel" ? "7311,7311003,7309" : "7311,7395,7369";

    const keywords =
      data.kind === "fuel"
        ? ["truck stop", "travel center", "diesel", "Pilot", "Flying J", "Loves", "TA Petro"]
        : ["truck stop", "rest area", "travel center", "truck parking"];

    const radiusM = 50000; // initial provider search around each sample
    const corridorRadiusMi = 35; // final route-corridor filter for simplified route geometry
    const seen = new Map<string, TruckPoi>();
    let tomtomRawCount = 0;
    let tomtomFilteredCount = 0;

    const addRaw = (r: RawResult, sampleLat: number, sampleLon: number) => {
      if (!r.position) return;
      tomtomRawCount += 1;
      const brand = r.poi?.brands?.[0]?.name ?? null;
      const name = r.poi?.name ?? brand ?? "Truck stop";
      const cats = r.poi?.categories ?? [];
      const type = classify(name, brand, cats);
      // For "fuel" kind, drop pure rest areas/parking and small non-truck stations.
      if (data.kind === "fuel" && (type === "rest_area" || type === "parking")) {
        tomtomFilteredCount += 1;
        return;
      }
      if (data.kind === "parking" && type === "fuel") {
        tomtomFilteredCount += 1;
        return;
      }
      const routeDistance = distanceToRouteMi(data.geometry, r.position.lat, r.position.lon);
      if (routeDistance == null || routeDistance > corridorRadiusMi) {
        tomtomFilteredCount += 1;
        return;
      }
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


    const totalFound = pois.length;
    const routeStart = data.geometry[0];
    const routeEnd = data.geometry[data.geometry.length - 1];
    const debug = {
      routeUsed: `${routeStart[1].toFixed(4)}, ${routeStart[0].toFixed(4)} → ${routeEnd[1].toFixed(4)}, ${routeEnd[0].toFixed(4)}`,
      routePointCount: data.geometry.length,
      searchPointCount: samples.length,
      corridorRadiusMi,
      rawResultsCount: tomtomRawCount,
      filteredResultsCount: totalFound,
      filteredOutCount: tomtomFilteredCount,
      searchingFullRoute: samples.length > 1,
    };

    return {
      connected: true,
      provider,
      message,
      totalFound,
      debug,
      pois: pois.slice(0, data.limit ?? 60),
    };
  });
