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
  kind: z.enum(["fuel", "parking"]),
  limit: z.number().int().min(1).max(100).optional(),
});

export type TruckPoiType = "fuel" | "truck_stop" | "rest_area" | "parking";
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
  const samples: Array<{ lat: number; lon: number }> = [];
  let target = 0;
  let idx = 0;
  while (target <= total && samples.length < maxSamples) {
    while (idx < pts.length - 1 && pts[idx + 1].cum < target) idx++;
    const p = pts[idx];
    samples.push({ lat: p.lat, lon: p.lon });
    target += stepMi;
  }
  // Always include destination
  const last = pts[pts.length - 1];
  if (
    samples.length === 0 ||
    distMi(samples[samples.length - 1].lat, samples[samples.length - 1].lon, last.lat, last.lon) > 5
  ) {
    samples.push({ lat: last.lat, lon: last.lon });
  }
  return samples.slice(0, maxSamples);
}

function classify(
  name: string,
  brand: string | null,
  categories: string[],
  fallback: TruckPoiType = "fuel",
): TruckPoiType {
  const hay = `${name} ${brand ?? ""} ${categories.join(" ")}`.toLowerCase();
  if (/rest area|rest stop/.test(hay)) return "rest_area";
  if (/truck stop|travel center|travel centre|truckstop/.test(hay)) return "truck_stop";
  if (TRUCK_FUEL_BRANDS.some((b) => hay.includes(b.toLowerCase()))) return "truck_stop";
  if (/diesel|fuel|gas station|petrol|gasoline/.test(hay)) return "fuel";
  if (/parking/.test(hay)) return "parking";
  return fallback;
}

function distanceToRouteMi(geom: Array<[number, number]>, lat: number, lon: number) {
  let best = Infinity;
  for (const [routeLon, routeLat] of geom) {
    best = Math.min(best, distMi(lat, lon, routeLat, routeLon));
  }
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

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function osmQuery(kind: "fuel" | "parking", samples: Array<{ lat: number; lon: number }>) {
  const radiusM = 30000;
  const parts: string[] = [];
  for (const s of samples) {
    if (kind === "fuel") {
      parts.push(`node(around:${radiusM},${s.lat},${s.lon})["amenity"="fuel"];`);
      parts.push(`way(around:${radiusM},${s.lat},${s.lon})["amenity"="fuel"];`);
      parts.push(`node(around:${radiusM},${s.lat},${s.lon})["highway"="services"];`);
      parts.push(`way(around:${radiusM},${s.lat},${s.lon})["highway"="services"];`);
    } else {
      parts.push(`node(around:${radiusM},${s.lat},${s.lon})["highway"="rest_area"];`);
      parts.push(`way(around:${radiusM},${s.lat},${s.lon})["highway"="rest_area"];`);
      parts.push(`node(around:${radiusM},${s.lat},${s.lon})["highway"="services"];`);
      parts.push(`way(around:${radiusM},${s.lat},${s.lon})["highway"="services"];`);
      parts.push(`node(around:${radiusM},${s.lat},${s.lon})["amenity"="parking"]["hgv"];`);
      parts.push(`way(around:${radiusM},${s.lat},${s.lon})["amenity"="parking"]["hgv"];`);
    }
  }
  return `[out:json][timeout:25];(${parts.join("\n")});out center tags 100;`;
}

async function searchOpenStreetMapPois(
  kind: "fuel" | "parking",
  geometry: Array<[number, number]>,
  samples: Array<{ lat: number; lon: number }>,
): Promise<TruckPoi[]> {
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Navaroad/1.0 route-poi-search",
      },
      body: `data=${encodeURIComponent(osmQuery(kind, samples))}`,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { elements?: OsmElement[] };
    const seen = new Map<string, TruckPoi>();
    for (const el of json.elements ?? []) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      const tags = el.tags ?? {};
      const brand = tags.brand ?? tags.operator ?? null;
      const name = tags.name ?? brand ?? (tags.highway === "rest_area" ? "Rest area" : tags.highway === "services" ? "Travel center" : kind === "fuel" ? "Fuel station" : "Truck parking");
      const categories = [tags.amenity, tags.highway, tags.hgv, tags.parking].filter(Boolean) as string[];
      const type = classify(name, brand, categories, kind === "parking" ? "parking" : "fuel");
      if (kind === "fuel" && type === "parking") continue;
      if (kind === "parking" && type === "fuel") continue;
      const id = `osm:${el.type}:${el.id}`;
      if (seen.has(id)) continue;
      seen.set(id, {
        id,
        name,
        brand,
        category: categories[0] ?? type,
        type,
        address: [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
        city: tags["addr:city"] ?? null,
        state: tags["addr:state"] ?? null,
        lat,
        lon,
        distanceMi: distanceToRouteMi(geometry, lat, lon),
        phone: tags.phone ?? null,
        source: "OpenStreetMap",
      });
    }
    return Array.from(seen.values()).sort(
      (a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity),
    );
  } catch {
    return [];
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
        message:
          data.kind === "fuel"
            ? "Fuel stop data not connected yet."
            : "Live truck parking availability not connected yet.",
        pois: [],
      };
    }
    if (data.geometry.length < 2) {
      return { connected: true, provider: "TomTom", pois: [] };
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

    const radiusM = 50000; // 50 km corridor around each sample
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
      const id = r.id ?? `${r.position.lat.toFixed(5)},${r.position.lon.toFixed(5)}`;
      const distance =
        r.dist != null ? r.dist / 1609.34 : distMi(sampleLat, sampleLon, r.position.lat, r.position.lon);
      const existing = seen.get(id);
      if (existing) {
        if ((existing.distanceMi ?? Infinity) > distance) existing.distanceMi = distance;
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
        distanceMi: distance,
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
      rawTomTomCount: tomtomRawCount,
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

    if (pois.length === 0 && firstError) {
      const fallback = await searchOpenStreetMapPois(data.kind, data.geometry, samples);
      if (fallback.length > 0) {
        pois = fallback;
        provider = "OpenStreetMap";
        message = `TomTom Search returned: ${firstError}. Showing route-wide ${data.kind === "fuel" ? "fuel stops" : "parking locations"} from OpenStreetMap instead.`;
      } else {
        message = `TomTom Search returned: ${firstError}. No fallback locations were returned along the route.`;
      }
    }

    return {
      connected: true,
      provider,
      message,
      pois: pois.slice(0, data.limit ?? 60),
    };
  });
