// RoadAlertService — TomTom Traffic Incidents integration.
//
// Provider: TomTom Traffic API v5 (Incident Details).
// Docs: https://developer.tomtom.com/traffic-api/documentation/traffic-incidents/incident-details
//
// Requires TOMTOM_API_KEY secret. Without it the service returns an empty
// list — never fabricated data. TomTom needs a bounding box; the
// route-analysis pipeline passes the route bbox so we only return incidents
// touching the planned path.

export type RoadAlert = {
  id: string;
  source: "dot";
  provider: string;
  category: "road_closure" | "construction" | "detour" | "chain_restriction" | "incident";
  severity: "low" | "medium" | "high" | "critical";
  roadway: string;
  location: string;
  description: string;
  recommendedAction: string;
  lat?: number;
  lon?: number;
  updatedAt: string;
};

// TomTom iconCategory codes — see provider docs. We map to our buckets.
function mapCategory(iconCategory: number | undefined): RoadAlert["category"] {
  switch (iconCategory) {
    case 8: // road closed
      return "road_closure";
    case 9: // road works / construction
      return "construction";
    case 6: // lane restrictions / detour
      return "detour";
    case 3: // weather restriction (often chain control)
    case 4:
      return "chain_restriction";
    default:
      return "incident";
  }
}

// magnitudeOfDelay: 0 unknown, 1 minor, 2 moderate, 3 major, 4 undefined/closed
function mapSeverity(magnitude: number | undefined, category: RoadAlert["category"]): RoadAlert["severity"] {
  if (category === "road_closure") return "critical";
  switch (magnitude) {
    case 3:
      return "high";
    case 2:
      return "medium";
    case 1:
      return "low";
    case 4:
      return "critical";
    default:
      return "medium";
  }
}

function recommend(category: RoadAlert["category"]): string {
  switch (category) {
    case "road_closure":
      return "Road closed ahead — re-route required.";
    case "construction":
      return "Construction zone — reduce speed, expect lane shifts.";
    case "detour":
      return "Detour in effect — follow posted signage.";
    case "chain_restriction":
      return "Chain control in effect — carry chains.";
    default:
      return "Incident reported — slow down and increase following distance.";
  }
}

type TomTomIncident = {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    iconCategory?: number;
    magnitudeOfDelay?: number;
    events?: Array<{ description?: string; code?: number; iconCategory?: number }>;
    startTime?: string;
    endTime?: string;
    from?: string;
    to?: string;
    delay?: number;
    roadNumbers?: string[];
    lastReportTime?: string;
  };
  id?: string | number;
};

function firstPoint(geom: TomTomIncident["geometry"]): { lat?: number; lon?: number } {
  if (!geom || !geom.coordinates) return {};
  const walk = (n: unknown): [number, number] | null => {
    if (Array.isArray(n)) {
      if (typeof n[0] === "number" && typeof n[1] === "number") return [n[0] as number, n[1] as number];
      for (const c of n) {
        const p = walk(c);
        if (p) return p;
      }
    }
    return null;
  };
  const p = walk(geom.coordinates);
  return p ? { lon: p[0], lat: p[1] } : {};
}

export async function fetchRoadAlerts(opts?: {
  bbox?: [number, number, number, number]; // [minLon,minLat,maxLon,maxLat]
}): Promise<RoadAlert[]> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key || !opts?.bbox) return [];

  const [minLon, minLat, maxLon, maxLat] = opts.bbox;
  // Pad the bbox slightly (~5km) so incidents just off the route still surface.
  const pad = 0.05;
  const bbox = `${minLon - pad},${minLat - pad},${maxLon + pad},${maxLat + pad}`;
  const fields =
    "{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,delay,roadNumbers,lastReportTime}}}";
  const url =
    `https://api.tomtom.com/traffic/services/5/incidentDetails` +
    `?bbox=${encodeURIComponent(bbox)}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&language=en-US` +
    `&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11,14` +
    `&timeValidityFilter=present` +
    `&key=${encodeURIComponent(key)}`;

  let incidents: TomTomIncident[] = [];
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("TomTom traffic incidents request failed", { status: res.status });
      return [];
    }
    const j = (await res.json()) as { incidents?: TomTomIncident[] };
    incidents = j.incidents ?? [];
  } catch (e) {
    console.warn("TomTom traffic incidents request failed", { error: (e as Error).message });
    return [];
  }

  return incidents.slice(0, 200).map((inc, idx) => {
    const p = inc.properties ?? {};
    const cat = mapCategory(p.iconCategory);
    const sev = mapSeverity(p.magnitudeOfDelay, cat);
    const point = firstPoint(inc.geometry);
    const event = p.events?.[0]?.description;
    const roadway = (p.roadNumbers && p.roadNumbers.length > 0 ? p.roadNumbers.join(", ") : p.from) ?? "Unknown road";
    const fromTo = [p.from, p.to].filter(Boolean).join(" → ");
    return {
      id: String(inc.id ?? `tomtom-${idx}-${p.lastReportTime ?? ""}`),
      source: "dot" as const,
      provider: "TomTom",
      category: cat,
      severity: sev,
      roadway,
      location: fromTo || roadway,
      description: event ?? "Traffic incident reported",
      recommendedAction: recommend(cat),
      lat: point.lat,
      lon: point.lon,
      updatedAt: p.lastReportTime ?? p.startTime ?? new Date().toISOString(),
    };
  });
}
