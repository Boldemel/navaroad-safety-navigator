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
  "Sapp Bros",
  "Sapp Brothers",
  "Road Ranger",
  "Casey's Travel Center",
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
  kind: z.enum(["rest_area", "truck_stop", "weigh_station", "cat_scale"]),
  limit: z.number().int().min(1).max(100).optional(),
});

export type TruckPoiType = "fuel" | "truck_stop" | "rest_area" | "parking" | "weigh_station" | "cat_scale";

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
  if (isCatScale(hay)) return "cat_scale";
  if (TRUCK_STOP_BRANDS.some((b) => hay.includes(b.toLowerCase()))) return "truck_stop";
  if (/truck stop|travel center|travel centre|truckstop|truck plaza/.test(hay)) return "truck_stop";
  if (/weigh station|weigh-in-motion|inspection station|port of entry|agricultural inspection/.test(hay)) return "weigh_station";
  if (/rest area|rest stop/.test(hay)) return "rest_area";
  if (/diesel|fuel|gas station|petrol|gasoline/.test(hay)) return "fuel";
  if (/parking/.test(hay)) return "parking";
  return fallback;
}

function isCatScale(hay: string) {
  return /\bcat\s*scale\b|certified\s*automated\s*truck\s*scale|certified\s*commercial\s*scale/.test(hay);
}

// Brands / keywords that indicate EV charging — excluded from Fuel Stops.
function isEvCharging(hay: string) {
  return /\bev\b|electric vehicle|charging station|supercharger|tesla|chargepoint|charge\s*point|electrify america|blink charging|\bblink\b(?!\s*charging)?|evgo|ev-go|wattstation|wattzilla|greenlots|semaconnect|flo charging|volta charging/.test(hay);
}

// Hard exclusions — banks, ATMs, financial services, EV-only chargers, and
// other non-truck-related POIs that TomTom sometimes returns inside the
// rest-area / weigh-station / truck-stop category searches.
function isExcludedJunk(hay: string) {
  if (isEvCharging(hay)) return true;
  return /\batm\b|\bbank\b|credit\s*union|financial|cardtronics|\belan\b|western\s*union|moneygram|insurance|mortgage|\bloan\b|pharmacy|hospital|clinic|dental|hotel|motel|\binn\b|\bresort\b|restaurant|cafe|coffee|mcdonald|starbucks|subway|burger|\bpizza\b|grocery|\bmall\b|car\s*wash|auto\s*parts|dealership/.test(hay);
}

function isWeighStationStrict(hay: string) {
  if (truckStopAllowed(hay)) return false;
  if (isCatScale(hay)) return false;
  if (isExcludedJunk(hay)) return false;
  return /weigh\s*station|weigh-in-motion|truck\s*inspection|inspection\s*station|port\s*of\s*entry|dot\s*scale|scale\s*house|agricultural\s*inspection/.test(hay);
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
    streetName?: string;
    streetNumber?: string;
    routeNumbers?: string[];
    municipality?: string;
    municipalitySubdivision?: string;
    countrySecondarySubdivision?: string;
    countrySubdivision?: string;
    countrySubdivisionName?: string;
    postalCode?: string;
  };
  position?: { lat: number; lon: number };
  dist?: number;
};

type TomTomAddress = NonNullable<RawResult["address"]>;

function hasSpecificAddress(address: string | null | undefined, name?: string | null, city?: string | null, state?: string | null) {
  const value = (address ?? "").trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  const weak = ["location", "rest area", "weigh station", "service area", "source: open"];
  if (weak.includes(lower)) return false;
  if (name && lower === name.trim().toLowerCase()) return false;
  if (city && lower === city.trim().toLowerCase()) return false;
  if (state && lower === state.trim().toLowerCase()) return false;
  if (/^\d{5}(?:-\d{4})?$/.test(value)) return false;
  if (/\b(i[-\s]?\d+|interstate|us[-\s]?\d+|state\s+route|sr[-\s]?\d+|hwy|highway|route|road|rd\b|street|st\b|avenue|ave\b|drive|dr\b|boulevard|blvd\b|pike|parkway|turnpike|exit\s+\d+)\b/i.test(value)) return true;
  return /\d/.test(value) && /[a-z]/i.test(value);
}

function tomtomAddressLine(address?: TomTomAddress | null) {
  if (!address) return "";
  const street = [address.streetNumber, address.streetName].filter(Boolean).join(" ").trim();
  const route = address.routeNumbers?.[0]?.trim() ?? "";
  const freeform = address.freeformAddress?.trim() ?? "";
  const city = address.municipality ?? address.municipalitySubdivision ?? null;
  const state = address.countrySubdivision ?? address.countrySubdivisionName ?? null;
  for (const candidate of [street, freeform, route]) {
    if (hasSpecificAddress(candidate, null, city, state)) return candidate;
  }
  return "";
}

type TomTomCall = {
  url: string;
  status: number;
  error: string | null;
  results: RawResult[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tomtomRequest(url: string): Promise<TomTomCall> {
  let last: TomTomCall = { url, status: 0, error: "TomTom request failed", results: [] };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url);
      const j = (await r.json().catch(() => null)) as { results?: RawResult[] } | null;
      last = { url, status: r.status, error: r.ok ? null : tomtomError(j), results: r.ok ? j?.results ?? [] : [] };
      if (r.ok || (r.status !== 429 && r.status < 500) || attempt === 3) return last;
      const retryAfter = Number(r.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 700 * (attempt + 1) ** 2);
    } catch {
      last = { url, status: 0, error: "TomTom request failed", results: [] };
      if (attempt === 3) return last;
      await sleep(700 * (attempt + 1) ** 2);
    }
  }
  return last;
}

function truckStopAllowed(hay: string) {
  return (
    /\bpilot\b/.test(hay) ||
    /flying\s*j/.test(hay) ||
    /love'?s/.test(hay) ||
    /\bta\b\s*(travel|truck)?/.test(hay) ||
    /\bpetro\b/.test(hay) ||
    /sapp\s*(bros|brothers)/.test(hay) ||
    /road\s*ranger/.test(hay) ||
    (/casey'?s/.test(hay) && /travel\s*cent(er|re)/.test(hay)) ||
    /travel\s*cent(er|re)s?/.test(hay) ||
    /truck\s*plaza/.test(hay) ||
    /truck\s*stop|truckstop/.test(hay)
  );
}

// Strict reject list for "truck stop" — RV parks, campgrounds, etc.
function isNotTruckStop(hay: string) {
  return /\brv\s*park\b|campground|koa\b|camp\s*ground|\brv\s*resort\b|mobile\s*home/.test(hay);
}

type OsmPoi = {
  osmType: string;
  osmId: string;
  lat: number;
  lon: number;
  name: string;
  category: string;
  type: TruckPoiType;
  address: string | null;
  city: string | null;
  state: string | null;
};

function overpassQueryFor(kind: "rest_area" | "truck_stop" | "weigh_station" | "cat_scale", samples: Array<{ lat: number; lon: number }>): string {
  const radius = 50000;
  const truckBrandRegex = "Pilot|Flying J|Love.?s|TA Travel|TravelCenters|Petro|Sapp Bros|Sapp Brothers|Road Ranger|Casey.?s Travel";
  const clauses: string[] = [];
  for (const s of samples) {
    const around = `around:${radius},${s.lat.toFixed(5)},${s.lon.toFixed(5)}`;
    if (kind === "truck_stop") {
      clauses.push(`node["amenity"="fuel"]["hgv"~"yes|designated",i](${around});`);
      clauses.push(`way["amenity"="fuel"]["hgv"~"yes|designated",i](${around});`);
      clauses.push(`node["amenity"="fuel"]["fuel:HGV_diesel"="yes"](${around});`);
      clauses.push(`way["amenity"="fuel"]["fuel:HGV_diesel"="yes"](${around});`);
      clauses.push(`node["brand"~"${truckBrandRegex}",i](${around});`);
      clauses.push(`way["brand"~"${truckBrandRegex}",i](${around});`);
      clauses.push(`node["name"~"truck stop|truckstop|truck plaza|travel cent(er|re)|${truckBrandRegex}",i](${around});`);
      clauses.push(`way["name"~"truck stop|truckstop|truck plaza|travel cent(er|re)|${truckBrandRegex}",i](${around});`);
    } else if (kind === "rest_area") {
      clauses.push(`node["highway"="rest_area"](${around});`);
      clauses.push(`way["highway"="rest_area"](${around});`);
      clauses.push(`node["highway"="services"](${around});`);
      clauses.push(`way["highway"="services"](${around});`);
    } else if (kind === "weigh_station") {
      clauses.push(`node["highway"="weigh_station"](${around});`);
      clauses.push(`way["highway"="weigh_station"](${around});`);
      clauses.push(`node["amenity"="weighbridge"](${around});`);
      clauses.push(`way["amenity"="weighbridge"](${around});`);
    } else {
      // cat_scale — match by brand or name (CAT Scale Company tags vary)
      clauses.push(`node["brand"~"CAT Scale",i](${around});`);
      clauses.push(`way["brand"~"CAT Scale",i](${around});`);
      clauses.push(`node["name"~"CAT Scale",i](${around});`);
      clauses.push(`way["name"~"CAT Scale",i](${around});`);
      clauses.push(`node["operator"~"CAT Scale",i](${around});`);
    }
  }
  return `[out:json][timeout:25];(${clauses.join("")});out center 400;`;
}

async function overpassAlongRoute(
  samples: Array<{ lat: number; lon: number }>,
  kind: "rest_area" | "truck_stop" | "weigh_station" | "cat_scale",
): Promise<{ results: OsmPoi[]; error: string | null }> {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  const body = "data=" + encodeURIComponent(overpassQueryFor(kind, samples));
  let lastError: string | null = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Navaroad/1.0" },
        body,
      });
      if (!r.ok) {
        lastError = `Overpass ${r.status}`;
        continue;
      }
      const j = (await r.json().catch(() => null)) as {
        elements?: Array<{
          type: string;
          id: number;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }>;
      } | null;
      const elements = j?.elements ?? [];
      const out: OsmPoi[] = [];
      for (const el of elements) {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        const tags = el.tags ?? {};
        let type: TruckPoiType;
        let category: string;
        let name = tags.name ?? "";
        if (kind === "truck_stop") {
          type = "truck_stop";
          category = "Truck stop";
          if (!name) name = tags.brand ?? tags.operator ?? "Truck Stop";
        } else if (kind === "weigh_station") {
          type = "weigh_station";
          category = "Weigh station";
          if (!name) name = "Weigh Station";
        } else if (kind === "cat_scale") {
          type = "cat_scale";
          category = "CAT Scale";
          if (!name) name = tags.brand ? `${tags.brand} CAT Scale` : "CAT Scale";
        } else if (tags.amenity === "parking") {
          type = "parking";
          category = "Truck parking";
          if (!name) name = "Truck Parking";
        } else if (tags.highway === "services") {
          type = "rest_area";
          category = "Service area";
          if (!name) name = "Service Area";
        } else {
          type = "rest_area";
          category = "Rest area";
          if (!name) name = "Rest Area";
        }
        // Build a real street/location address from OSM addr:* tags when present.
        const streetParts = [
          [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
        ].filter(Boolean);
        const cityPart = tags["addr:city"] ?? tags["addr:town"] ?? tags["addr:village"] ?? null;
        const statePart = tags["addr:state"] ?? null;
        const roadPart = tags.ref ?? tags["destination:ref"] ?? tags["addr:street"] ?? tags.highway ?? null;
        const composed =
          tags["addr:full"] ??
          [streetParts.join(", ") || roadPart, cityPart, statePart].filter(Boolean).join(", ");
        out.push({
          osmType: el.type,
          osmId: String(el.id),
          lat,
          lon,
          name,
          category,
          type,
          address: composed || null,
          city: cityPart,
          state: statePart,
        });
      }
      return { results: out, error: null };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Overpass request failed";
    }
  }
  return { results: [], error: lastError };
}


async function tomtomNearby(
  key: string,
  lat: number,
  lon: number,
  categorySet: string,
  radiusM: number,
  brandSet?: string,
): Promise<TomTomCall> {
  const p = new URLSearchParams({
    key,
    lat: String(lat),
    lon: String(lon),
    radius: String(radiusM),
    limit: "50",
    categorySet,
  });
  if (brandSet) p.set("brandSet", brandSet);
  const url = `https://api.tomtom.com/search/2/nearbySearch/.json?${p}`;
  return tomtomRequest(url);
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
  return tomtomRequest(url);
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

    // Sample every ~50 miles along the route corridor (cap 40 samples to bound API calls).
    // On a 1,100 mi route this gives ~22 search points so brands/scales/stations
    // are searched from origin to destination, not just at the endpoints.
    const samples = sampleEveryMiles(data.geometry, 50, 40);

    // TomTom POI categories:
    // 7311 = Truck Stop / Travel Center, 7311003 = Truck-friendly fuel,
    // 7395 = Rest Area, 7397 = Tourist Information / Welcome Center,
    // 7314 = Weigh Station / Truck inspection.
    const categorySet =
      data.kind === "truck_stop" ? "7311,7311003"
      : data.kind === "weigh_station" ? "7314"
      : data.kind === "cat_scale" ? "7311,7311003"
      : "7395,7397"; // rest_area: Rest Area + Welcome Center

    const keywords =
      data.kind === "truck_stop"
        ? [
            "Pilot Travel Center",
            "Flying J",
            "Love's Travel Stop",
            "Loves Travel Stop",
            "TA Travel Center",
            "TravelCenters of America",
            "Petro Stopping Center",
            "Sapp Bros",
            "Road Ranger",
            "Casey's Travel Center",
            "truck stop",
            "travel center",
          ]
      : data.kind === "weigh_station"
        ? ["weigh station", "truck inspection", "port of entry", "inspection station", "scale house", "DOT scale", "agricultural inspection"]
      : data.kind === "cat_scale"
        ? ["CAT scale", "CAT scales", "certified automated truck scale", "truck scale"]
        : ["rest area", "welcome center", "safety rest area", "highway rest stop"];

    // TomTom brand IDs/names for truck stops — used with categorySearch's
    // brandSet parameter so a brand always surfaces even when keyword search
    // is noisy.
    const truckStopBrands = [
      "Love's Travel Stops",
      "Love's",
      "Pilot",
      "Pilot Travel Centers",
      "Flying J",
      "Pilot Flying J",
      "TA",
      "TravelCenters of America",
      "Petro",
      "Petro Stopping Centers",
      "Sapp Bros",
      "Road Ranger",
      "Casey's General Store",
    ];

    const radiusM = 50000; // initial provider search around each sample
    const corridorRadiusMi = data.kind === "truck_stop" ? 8 : data.kind === "weigh_station" ? 5 : 3;
    const seen = new Map<string, TruckPoi>();
    const cumMi = buildCumMi(data.geometry);
    let tomtomRawCount = 0;
    let routeFilteredCount = 0;
    let tomtomFilteredCount = 0;
    const rawTomTomResults: string[] = [];
    const routeFilteredResults: string[] = [];

    const addRaw = (r: RawResult, _sampleLat: number, _sampleLon: number) => {
      if (!r.position) return;
      tomtomRawCount += 1;
      const brand = r.poi?.brands?.[0]?.name ?? null;
      const name = r.poi?.name ?? brand ?? "Truck stop";
      const cats = r.poi?.categories ?? [];
      if (rawTomTomResults.length < 12) rawTomTomResults.push(`${name} · ${cats[0] ?? "uncategorized"}`);
      const fallbackType: TruckPoiType =
        data.kind === "weigh_station" ? "weigh_station"
        : data.kind === "cat_scale" ? "cat_scale"
        : data.kind === "rest_area" ? "rest_area"
        : "truck_stop";
      const type = classify(name, brand, cats, fallbackType);
      const hay = `${name} ${brand ?? ""} ${cats.join(" ")}`.toLowerCase();

      if (data.kind === "rest_area") {
        // Strict rest-area: must be an explicit rest area, welcome center,
        // service plaza, or travel plaza. Reject truck stops, fuel stations,
        // CAT scales, banks, ATMs, EV chargers, and other unrelated POIs.
        const looksLikeRestArea =
          /\brest\s*area\b|\brest\s*stop\b|welcome\s*cent(er|re)|safety\s*rest|service\s*plaza|travel\s*plaza|service\s*area/.test(hay);
        const isOtherCategory =
          truckStopAllowed(hay) ||
          isCatScale(hay) ||
          isExcludedJunk(hay) ||
          /gas\s*station|petrol|gasoline|fuel\s*station/.test(hay);
        if (!looksLikeRestArea || isOtherCategory) {
          tomtomFilteredCount += 1;
          return;
        }
      }
      if (data.kind === "truck_stop") {
        if (isNotTruckStop(hay) || isExcludedJunk(hay) || !truckStopAllowed(hay)) {
          tomtomFilteredCount += 1;
          return;
        }
      }
      if (data.kind === "weigh_station") {
        // Strict: only state weigh stations, ports of entry, official inspection
        // facilities. CAT scales and truck-stop brands are explicitly rejected.
        if (!isWeighStationStrict(hay)) {
          tomtomFilteredCount += 1;
          return;
        }
      }
      if (data.kind === "cat_scale") {
        if (!isCatScale(hay)) {
          tomtomFilteredCount += 1;
          return;
        }
      }

      const projection = projectOnRouteMi(data.geometry, cumMi, r.position.lat, r.position.lon);
      if (!projection || projection.perpMi > corridorRadiusMi) {
        tomtomFilteredCount += 1;
        return;
      }
      const routeDistance = projection.perpMi;
      const progressMi = projection.progressMi;
      routeFilteredCount += 1;
      if (routeFilteredResults.length < 12) routeFilteredResults.push(`${name} · ${routeDistance.toFixed(1)} mi`);
      const id = r.id ?? `${r.position.lat.toFixed(5)},${r.position.lon.toFixed(5)}`;
      const existing = seen.get(id);
      if (existing) {
        if ((existing.distanceMi ?? Infinity) > routeDistance) {
          existing.distanceMi = routeDistance;
          existing.routeProgressMi = progressMi;
        }
        return;
      }
      seen.set(id, {
        id,
        name,
        brand,
        category: cats[0] ?? type,
        type,
        address: tomtomAddressLine(r.address),
        city: r.address?.municipality ?? r.address?.municipalitySubdivision ?? null,
        state: r.address?.countrySubdivision ?? r.address?.countrySubdivisionName ?? null,
        lat: r.position.lat,
        lon: r.position.lon,
        distanceMi: routeDistance,
        routeProgressMi: progressMi,
        phone: r.poi?.phone ?? null,
        source: "TomTom",
        restrictions: null,
      });
    };


    // Concurrency-limited runner to stay under TomTom's per-second QPS cap.
    async function runLimited<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
      const out: T[] = new Array(tasks.length);
      let i = 0;
      const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (true) {
          const idx = i++;
          if (idx >= tasks.length) return;
          out[idx] = await tasks[idx]();
        }
      });
      await Promise.all(workers);
      return out;
    }

    // Step 1: category search at every sample, throttled.
    const categoryResults = await runLimited(
      samples.map((s) => () => tomtomNearby(key, s.lat, s.lon, categorySet, radiusM)),
      4,
    );
    samples.forEach((s, i) => categoryResults[i].results.forEach((r) => addRaw(r, s.lat, s.lon)));

    // Step 2: keyword fallback. Always run for truck_stop / weigh_station /
    // cat_scale so we surface multiple brands (not just whichever the category
    // search happened to return most of). For rest_area, only run when sparse.
    if (
      data.kind === "truck_stop" ||
      data.kind === "weigh_station" ||
      data.kind === "cat_scale" ||
      seen.size < 10
    ) {
      // Run keyword search across the full route (not just a strided subset)
      // so brands like Pilot/Flying J/Love's/TA/Petro/Sapp Bros/Road Ranger/
      // Casey's Travel Center and CAT Scales are surfaced end-to-end.
      // Cap the total number of keyword samples to keep API usage bounded.
      // Use every route sample for keyword search so each brand is queried
      // end-to-end with no gaps.
      const maxKwSamples = samples.length;
      const stride = 1;
      const kwSamples = samples;
      const kwList =
        data.kind === "truck_stop" ? keywords.slice(0, 10)
        : data.kind === "cat_scale" ? keywords.slice(0, 4)
        : keywords.slice(0, 4);
      const keywordTasks: Array<() => Promise<TomTomCall>> = [];
      const keywordSamples: Array<{ lat: number; lon: number }> = [];
      for (const s of kwSamples) {
        for (const kw of kwList) {
          keywordTasks.push(() => tomtomKeyword(key, kw, s.lat, s.lon, radiusM));
          keywordSamples.push(s);
        }
      }
      const kwResults = await runLimited(keywordTasks, 6);
      kwResults.forEach((call, i) =>
        call.results.forEach((r) => addRaw(r, keywordSamples[i].lat, keywordSamples[i].lon)),
      );
    }

    // Step 2b: brand-filtered nearby search for truck stops. This forces
    // TomTom to return each major brand (Love's, Pilot/Flying J, TA, Petro,
    // etc.) end-to-end along the route, even when keyword search misses
    // them due to noisy text matching.
    if (data.kind === "truck_stop") {
      const brandTasks: Array<() => Promise<TomTomCall>> = [];
      const brandTaskSamples: Array<{ lat: number; lon: number }> = [];
      for (const s of samples) {
        for (const brand of truckStopBrands) {
          brandTasks.push(() => tomtomNearby(key, s.lat, s.lon, "7311,7311003", radiusM, brand));
          brandTaskSamples.push(s);
        }
      }
      const brandResults = await runLimited(brandTasks, 6);
      brandResults.forEach((call, i) =>
        call.results.forEach((r) => addRaw(r, brandTaskSamples[i].lat, brandTaskSamples[i].lon)),
      );
    }

    // Step 3 (supplemental): OpenStreetMap Overpass for rest areas, truck
    // parking, and weigh stations. TomTom coverage of these categories is
    // sparse in the US; OSM has much better data. Routing/navigation/fuel
    // remain TomTom-only.
    let osmRawCount = 0;
    let osmAddedCount = 0;
    let osmError: string | null = null;
    if (data.kind === "rest_area" || data.kind === "weigh_station" || data.kind === "cat_scale") {
      const osm = await overpassAlongRoute(samples, data.kind);
      osmError = osm.error;
      osmRawCount = osm.results.length;
      for (const o of osm.results) {
        const projection = projectOnRouteMi(data.geometry, cumMi, o.lat, o.lon);
        if (!projection || projection.perpMi > corridorRadiusMi) continue;
        const hay = `${o.name} ${o.category}`.toLowerCase();
        // Cross-kind validation: reject anything that belongs in another bucket.
        if (data.kind === "rest_area") {
          if (truckStopAllowed(hay) || isCatScale(hay) || isExcludedJunk(hay)) continue;
          if (o.type !== "rest_area") continue;
        }
        if (data.kind === "weigh_station") {
          if (isCatScale(hay) || truckStopAllowed(hay) || isExcludedJunk(hay)) continue;
          if (o.type !== "weigh_station") continue;
        }
        if (data.kind === "cat_scale") {
          if (o.type !== "cat_scale") continue;
        }
        let dupe = false;
        for (const existing of seen.values()) {
          if (distMi(existing.lat, existing.lon, o.lat, o.lon) < 0.25) {
            dupe = true;
            break;
          }
        }
        if (dupe) continue;
        const osmCity = o.city;
        const osmState = o.state;
        const osmAddress = hasSpecificAddress(o.address, o.name, osmCity, osmState) ? o.address : "";
        const id = `osm-${o.osmType}-${o.osmId}`;
        seen.set(id, {
          id,
          name: o.name,
          brand: null,
          category: o.category,
          type: o.type,
          address: osmAddress ?? "",
          city: osmCity,
          state: osmState,
          lat: o.lat,
          lon: o.lon,
          distanceMi: projection.perpMi,
          routeProgressMi: projection.progressMi,
          phone: null,
          source: "OpenStreetMap",
          restrictions: null,
        });
        osmAddedCount += 1;
      }
    }

    const tomtomCalls = [...categoryResults];
    const firstError = tomtomCalls.find((c) => c.error)?.error ?? null;
    const firstFuelUrl = redactTomTomKey(categoryResults[0]?.url ?? "", key);
    console.info("Navaroad OSM Overpass diagnostics", {
      kind: data.kind, osmRawCount, osmAddedCount, osmError,
    });
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

    // Sort by route progression (driving order) — closest upcoming stop first.
    // Tiebreak by perpendicular distance from the route.
    const pois = Array.from(seen.values()).sort((a, b) => {
      const pa = a.routeProgressMi ?? Infinity;
      const pb = b.routeProgressMi ?? Infinity;
      if (pa !== pb) return pa - pb;
      return (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity);
    });
    const provider = "TomTom";
    let message =
      data.kind === "rest_area" && pois.length > 0
        ? "Rest areas found along the route corridor."
        : undefined;

    if (pois.length === 0) {
      message = firstError
        ? `TomTom Search returned: ${firstError}. No locations found along the route.`
        : "No TomTom locations found along the route corridor.";
    }


    const deduplicatedCount = pois.length;
    const displayedPois = pois.slice(0, data.limit ?? 60);

    // Backfill missing/weak addresses for displayed POIs (typically OSM rest
    // areas and weigh stations) using TomTom reverse geocoding. Throttled to
    // keep API usage bounded.
    const needsAddress = displayedPois.filter((p) => !hasSpecificAddress(p.address, p.name, p.city, p.state) || !p.city || !p.state);
    if (needsAddress.length > 0) {
      await runLimited(
        needsAddress.map((p) => async () => {
          try {
            const url = `https://api.tomtom.com/search/2/reverseGeocode/${p.lat},${p.lon}.json?key=${encodeURIComponent(key)}`;
            const r = await fetch(url);
            if (!r.ok) return;
            const j = (await r.json().catch(() => null)) as {
              addresses?: Array<{ address?: TomTomAddress }>;
            } | null;
            const a = j?.addresses?.[0]?.address;
            if (!a) return;
            const street = [a.streetNumber, a.streetName].filter(Boolean).join(" ").trim();
            const candidate = tomtomAddressLine(a) || street;
            if (candidate && !hasSpecificAddress(p.address, p.name, p.city, p.state)) {
              p.address = candidate;
            }
            if (!p.city && (a.municipality || a.municipalitySubdivision)) p.city = a.municipality ?? a.municipalitySubdivision ?? null;
            if (!p.state) p.state = a.countrySubdivision ?? a.countrySubdivisionName ?? null;
          } catch {
            // ignore reverse geocode errors; POI remains without address
          }
        }),
        6,
      );
    }

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
