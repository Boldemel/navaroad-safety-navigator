import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type NearbyPoi = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  type: "truck_stop" | "rest_area" | "parking" | "weigh_station" | "fuel";
  address: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  lat: number;
  lon: number;
  distanceMi: number;
  amenities: { showers: boolean; scales: boolean; diesel: boolean; parking: boolean };
};

const Input = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusMi: z.number().min(5).max(200).default(50),
  kind: z.enum(["truck_stop", "rest_area", "parking", "weigh_station", "all"]).default("all"),
});

// Known truck-stop brand names (whole-word match against name/brand fields)
const TRUCK_BRAND_RE = /\b(pilot(?:\s+travel\s+cent\w+)?|flying\s+j|love'?s(?:\s+travel\s+stops?)?|ta\s+(?:travel\s+cent\w+|express)|travelcenters?\s+of\s+america|petro(?:\s+stopping\s+cent\w+)?|sapp\s+bros|road\s+ranger|kwik\s+trip|maverik)\b/i;
const TRUCK_STOP_NAME_RE = /\b(truck\s*stop|travel\s+cent(?:er|re)|truck\s+plaza|fuel\s+plaza)\b/i;
const REST_AREA_RE = /\b(rest\s+area|rest\s+stop|service\s+area|service\s+plaza|welcome\s+cent(?:er|re))\b/i;
const PARKING_RE = /\b(truck\s+parking|truck\s+lot|overnight\s+parking)\b/i;
const WEIGH_RE = /\b(weigh\s+station|inspection\s+station|port\s+of\s+entry|scale\s+house|weight\s+station)\b/i;

// TomTom POI categories that legitimately represent fuel/truck stops
const TRUCK_STOP_CATEGORIES = /petrol\s+station|truck\s+stop|rest\s+area|service\s+area|service\s+station|gas\s+station/i;

function dist(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

type RawResult = {
  id?: string;
  poi?: {
    name?: string;
    brands?: Array<{ name: string }>;
    phone?: string;
    categories?: string[];
    classifications?: Array<{ code?: string; names?: Array<{ name: string }> }>;
  };
  address?: { freeformAddress?: string; municipality?: string; countrySubdivision?: string };
  position?: { lat: number; lon: number };
};

async function tomtomSearch(query: string, lat: number, lon: number, radiusMeters: number, key: string): Promise<RawResult[]> {
  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?lat=${lat}&lon=${lon}&radius=${radiusMeters}&limit=100&key=${key}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: RawResult[] };
    return j.results ?? [];
  } catch { return []; }
}

function categoryText(r: RawResult): string {
  const cats = r.poi?.categories ?? [];
  const classNames = (r.poi?.classifications ?? []).flatMap((c) => (c.names ?? []).map((n) => n.name));
  return [...cats, ...classNames].join(" ").toLowerCase();
}

function classify(r: RawResult): NearbyPoi["type"] | null {
  const name = (r.poi?.name ?? "").trim();
  const brand = r.poi?.brands?.[0]?.name ?? "";
  const cats = categoryText(r);

  // Weigh stations / ports of entry
  if (WEIGH_RE.test(name) || WEIGH_RE.test(cats)) return "weigh_station";

  // Rest areas
  if (REST_AREA_RE.test(name) || REST_AREA_RE.test(cats)) return "rest_area";

  // Truck stops: require a real brand match (with truck-stop/fuel category) OR an
  // explicit truck-stop / travel-center phrase in the name.
  const brandHit = TRUCK_BRAND_RE.test(brand) || TRUCK_BRAND_RE.test(name);
  const truckPhrase = TRUCK_STOP_NAME_RE.test(name);
  const fuelCat = TRUCK_STOP_CATEGORIES.test(cats);
  if (truckPhrase) return "truck_stop";
  if (brandHit && fuelCat) return "truck_stop";

  // Dedicated truck parking lots
  if (PARKING_RE.test(name) || PARKING_RE.test(cats)) return "parking";

  return null;
}

export const findNearbyTruckStops = createServerFn({ method: "POST" })
  .inputValidator((data: z.infer<typeof Input>) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.TOMTOM_API_KEY;
    if (!key) return { connected: false, pois: [] as NearbyPoi[], message: "TomTom API key not configured" };
    const radiusMeters = Math.round(data.radiusMi * 1609.34);
    const queries: string[] = [];
    if (data.kind === "truck_stop" || data.kind === "all") {
      queries.push("truck stop", "travel center", "Pilot Travel Center", "Flying J", "Loves Travel Stop", "TA Travel Center", "Petro Stopping Center");
    }
    if (data.kind === "rest_area" || data.kind === "all") queries.push("rest area", "welcome center", "service plaza");
    if (data.kind === "parking" || data.kind === "all") queries.push("truck parking");
    if (data.kind === "weigh_station" || data.kind === "all") queries.push("weigh station", "port of entry");

    const seen = new Map<string, NearbyPoi>();
    const all = await Promise.all(queries.map((q) => tomtomSearch(q, data.lat, data.lon, radiusMeters, key)));
    for (const list of all) {
      for (const r of list) {
        if (!r.position) continue;
        const type = classify(r);
        if (!type) continue;
        if (data.kind !== "all" && type !== data.kind) continue;
        const id = r.id ?? `${r.position.lat},${r.position.lon}`;
        if (seen.has(id)) continue;
        const d = dist(data.lat, data.lon, r.position.lat, r.position.lon);
        if (d > data.radiusMi) continue;
        const name = r.poi?.name ?? "";
        const brand = r.poi?.brands?.[0]?.name ?? null;
        const hay = `${name} ${brand ?? ""}`.toLowerCase();
        const isMajorBrand = /flying\s+j|pilot|love|\bta\b|petro/i.test(hay);
        seen.set(id, {
          id,
          name: name || brand || "Unknown",
          brand,
          category: type,
          type,
          address: r.address?.freeformAddress ?? "",
          city: r.address?.municipality ?? null,
          state: r.address?.countrySubdivision ?? null,
          phone: r.poi?.phone ?? null,
          lat: r.position.lat,
          lon: r.position.lon,
          distanceMi: Math.round(d * 10) / 10,
          amenities: {
            showers: type === "truck_stop" && isMajorBrand,
            scales: type === "weigh_station" || (type === "truck_stop" && isMajorBrand),
            diesel: type === "truck_stop",
            parking: type !== "weigh_station",
          },
        });
      }
    }
    const pois = [...seen.values()].sort((a, b) => a.distanceMi - b.distanceMi).slice(0, 80);
    return { connected: true, pois };
  });
