import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geocode, getRoute, sampleRoute, ROUTE_NOT_CALCULATED_MESSAGE } from "./services/route-analysis.service";
import {
  fetchCurrentWeather,
  fetchAlertsForPoint,
  type WeatherAlert,
} from "./services/weather.service";
import { computeSafety } from "./services/safety-score.service";
import { fetchRoadAlerts, type RoadAlert } from "./services/road-alert.service";
import { searchTruckPoisForRoute, type TruckPoiResult } from "./poi-search.functions";
import { computeStateMileage, type StateSlice } from "./services/state-mileage.service";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InputSchema = z.object({
  origin: z.string().trim().min(2).max(200),
  destination: z.string().trim().min(2).max(200),
  truck: z.string().max(60).optional(),
  trailer: z.string().max(60).optional(),
  originCoords: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
  destinationCoords: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
  waypoints: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
      }),
    )
    .max(8)
    .optional(),
  truckProfile: z
    .object({
      heightIn: z.number().min(0).max(300).nullable().optional(),
      weightLbs: z.number().min(0).max(500000).nullable().optional(),
      lengthFt: z.number().min(0).max(200).nullable().optional(),
      axles: z.number().int().min(0).max(20).nullable().optional(),
      hazmat: z.boolean().optional(),
      loaded: z.boolean().optional(),
    })
    .optional(),
  requestId: z.string().max(80).optional(),
});

export type RouteDriverReport = {
  id: string;
  hazard_type: string;
  severity: "low" | "medium" | "high" | "critical";
  location: string;
  description: string | null;
  reporter_id: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
  distanceMi: number;
  confirm_count: number;
  dispute_count: number;
  photo_url: string | null;
};

type RouteWeatherAlert = WeatherAlert;

function routeSignature(geom: Array<[number, number]>) {
  if (geom.length < 2) return "none";
  let hash = 0;
  const max = Math.min(40, geom.length);
  for (let i = 0; i < max; i++) {
    const [lon, lat] = geom[Math.floor((i / Math.max(1, max - 1)) * (geom.length - 1))];
    const part = `${lon.toFixed(4)},${lat.toFixed(4)}`;
    for (let j = 0; j < part.length; j++) hash = (hash * 31 + part.charCodeAt(j)) >>> 0;
  }
  return `${geom.length}:${hash.toString(16)}`;
}

function emptyPoiResult(provider = "TomTom"): TruckPoiResult {
  return { connected: false, provider, totalFound: 0, pois: [] };
}

function distMi(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = 3958.8;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.asin(Math.sqrt(s));
}

function pointToSegmentDistanceMi(lat: number, lon: number, aLat: number, aLon: number, bLat: number, bLon: number) {
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
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToRouteMi(geom: Array<[number, number]>, lat: number, lon: number) {
  let best = Infinity;
  for (let i = 1; i < geom.length; i++) {
    const [aLon, aLat] = geom[i - 1];
    const [bLon, bLat] = geom[i];
    best = Math.min(best, pointToSegmentDistanceMi(lat, lon, aLat, aLon, bLat, bLon));
  }
  return Number.isFinite(best) ? best : null;
}

async function fetchRouteDriverReports(geometry: Array<[number, number]>, corridorMi = 10): Promise<RouteDriverReport[]> {
  if (geometry.length < 2) return [];
  const { data, error } = await supabaseAdmin
    .from("hazard_reports")
    .select("id,hazard_type,severity,location,description,reporter_id,latitude,longitude,created_at,status,expires_at,confirm_count,dispute_count,photo_url")
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data
    .map((h) => {
      if (h.latitude == null || h.longitude == null) return null;
      const d = distanceToRouteMi(geometry, h.latitude, h.longitude);
      if (d == null || d > corridorMi) return null;
      return {
        id: h.id,
        hazard_type: h.hazard_type,
        severity: (h.severity ?? "medium") as RouteDriverReport["severity"],
        location: h.location,
        description: h.description ?? null,
        reporter_id: h.reporter_id ?? null,
        latitude: h.latitude,
        longitude: h.longitude,
        created_at: h.created_at,
        distanceMi: d,
        confirm_count: h.confirm_count ?? 0,
        dispute_count: h.dispute_count ?? 0,
        photo_url: h.photo_url ?? null,
      } satisfies RouteDriverReport;
    })
    .filter((h): h is RouteDriverReport => h != null)
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

export type RouteAnalysis = {
  origin: { name: string; lat: number; lon: number };
  destination: { name: string; lat: number; lon: number };
  waypoints: Array<{ name: string; lat: number; lon: number }>;
  distanceKm: number;
  durationMin: number;
  geometry: Array<[number, number]>;
  routeStatus: "ok" | "fallback" | "unavailable";
  routeMessage?: string;
  weather: Array<{
    label: string;
    lat: number;
    lon: number;
    tempC: number | null;
    windKph: number | null;
    gustKph: number | null;
    precipMm: number | null;
    visibilityKm: number | null;
    condition: string;
    available: boolean;
  }>;
  weatherAlerts: RouteWeatherAlert[];
  weatherAlertCount: number;
  roadAlertCount: number;
  roadAlerts: RoadAlert[];
  roadClosures: RoadAlert[];
  windRisks: Array<{
    id: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    source: "Weather API" | "DOT" | "Driver Report" | "System";
  }>;
  restAreas: TruckPoiResult;
  truckStops: TruckPoiResult;
  weighStations: TruckPoiResult;
  driverReports: RouteDriverReport[];
  routeId: string;
  etaMin: number;
  weatherImpact: {
    baseDurationMin: number;
    adjustedDurationMin: number;
    deltaMin: number;
    deltaPct: number;
    available: boolean;
    segments: Array<{
      label: string;
      multiplier: number;
      condition: string;
      reason: string;
      severity: "none" | "minor" | "moderate" | "severe";
    }>;
  };
  debug: {
    routeId: string;
    origin: string;
    destination: string;
    polyline: string;
    polylinePointCount: number;
    desktopResultCount: number;
    mobileResultCount: number;
    apiResponseTimestamp: string;
    cacheStatus: "fresh";
  };
  risks: Array<{
    type: "wind" | "precip" | "closure" | "hazard" | "temp" | "visibility" | "weather_alert";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    penalty: number;
    source: "Weather API" | "DOT" | "Driver Report" | "System";
  }>;
  breakdown: { weather: number; wind: number; closure: number; hazard: number };
  score: number | null;
  riskLevel: "Safe" | "Caution" | "High Risk" | "Extreme" | null;
  scoreExplanation: string;
  recommendedAction: string;
  generatedAt: string;
  dataAvailability: {
    weather: boolean;
    weatherAlerts: boolean;
    road: boolean;
    truckRestrictions: boolean;
  };
  truckRestrictions: {
    connected: boolean;
    message: string;
    verified: { clearance: boolean; weight: boolean; hazmat: boolean };
    profile: {
      heightIn: number | null;
      weightLbs: number | null;
      lengthFt: number | null;
      axles: number | null;
      hazmat: boolean;
      loaded: boolean | null;
    } | null;
  };
  providers: { weather: string; weatherAlerts: string; road: string };
  stateMileage: StateSlice[];
};


export const analyzeRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<RouteAnalysis> => {
    const [o, d2] = await Promise.all([
      data.originCoords
        ? Promise.resolve({ name: data.origin, lat: data.originCoords.lat, lon: data.originCoords.lon })
        : geocode(data.origin),
      data.destinationCoords
        ? Promise.resolve({ name: data.destination, lat: data.destinationCoords.lat, lon: data.destinationCoords.lon })
        : geocode(data.destination),
    ]);
    const waypoints = await Promise.all(
      (data.waypoints ?? []).map(async (w) =>
        w.lat != null && w.lon != null
          ? { name: w.label, lat: w.lat, lon: w.lon }
          : geocode(w.label).then((g) => ({ name: w.label, lat: g.lat, lon: g.lon })).catch(() => null),
      ),
    );
    const validWaypoints = waypoints.filter((w): w is { name: string; lat: number; lon: number } => w != null);
    const r = await getRoute(o, d2, {
      truckMode: true,
      waypoints: validWaypoints,
      truckProfile: data.truckProfile ?? undefined,
    });
    const routeAvailable = r.geometry.length >= 2;

    const samples = sampleRoute(r.geometry, 3);
    const labels = ["Origin", "Midpoint", "Destination"];
    const weatherSamples = await Promise.all(
      samples.map(async (s, i) => {
        const w = await fetchCurrentWeather(s.lat, s.lon).catch(() => null);
        return {
          label: labels[i] ?? `Point ${i + 1}`,
          lat: s.lat,
          lon: s.lon,
          tempC: w?.tempC ?? null,
          windKph: w?.windKph ?? null,
          gustKph: w?.gustKph ?? null,
          precipMm: w?.precipMm ?? null,
          visibilityKm: w?.visibilityKm ?? null,
          condition: w?.condition ?? "Unknown",
          available: w != null,
        };
      }),
    );

    // Per-point NWS alerts — sample along the route corridor so we catch
    // alerts between origin/midpoint/destination. Only alerts whose polygon
    // covers a route sample are returned. We keep the sample count modest
    // and run requests in small sequential batches so NWS does not throttle
    // (which previously caused alerts to silently drop to zero).
    const alertSamples = sampleRoute(r.geometry, 8);
    const dedup = new Map<string, WeatherAlert>();
    const batchSize = 3;
    for (let i = 0; i < alertSamples.length; i += batchSize) {
      const batch = alertSamples.slice(i, i + batchSize);
      const lists = await Promise.all(
        batch.map((s) => fetchAlertsForPoint(s.lat, s.lon).catch(() => [] as WeatherAlert[])),
      );
      for (const list of lists) for (const a of list) dedup.set(a.id, a);
    }
    const weatherAlerts = Array.from(dedup.values());

    // Compute route bbox so the DOT provider only returns incidents on/near the path.
    let bbox: [number, number, number, number] | undefined;
    if (r.geometry.length > 0) {
      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
      for (const [lon, lat] of r.geometry) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
      bbox = [minLon, minLat, maxLon, maxLat];
    }
    let roadAlerts: RoadAlert[] = [];
    let restAreas: TruckPoiResult = emptyPoiResult();
    let truckStops: TruckPoiResult = emptyPoiResult();
    let weighStations: TruckPoiResult = emptyPoiResult();
    let driverReports: RouteDriverReport[] = [];
    if (routeAvailable) {
      // Run road alerts + driver reports in parallel (cheap), then POI searches
      // sequentially. Concurrent POI fan-outs trip TomTom's rate limit and
      // cause the whole analysis to time out.
      [roadAlerts, driverReports] = await Promise.all([
        fetchRoadAlerts({ bbox }).catch(() => [] as RoadAlert[]),
        fetchRouteDriverReports(r.geometry).catch(() => []),
      ]);
      restAreas = await searchTruckPoisForRoute({ geometry: r.geometry, kind: "rest_area", limit: 100 }).catch(() => emptyPoiResult());
      truckStops = await searchTruckPoisForRoute({ geometry: r.geometry, kind: "truck_stop", limit: 100 }).catch(() => emptyPoiResult());
      weighStations = await searchTruckPoisForRoute({ geometry: r.geometry, kind: "weigh_station", limit: 100 }).catch(() => emptyPoiResult());
    }

    const weatherAvailable = weatherSamples.some((w) => w.available);

    const result = computeSafety({
      weatherSamples: weatherSamples.map((w) => ({
        tempC: w.tempC,
        windKph: w.windKph,
        gustKph: w.gustKph,
        precipMm: w.precipMm,
        visibilityKm: w.visibilityKm,
        condition: w.condition,
      })),
      weatherAlerts,
      roadAlerts,
      driverReportCount: driverReports.length,
      trailerType: data.trailer,
    });

    const haveAnyLiveData = routeAvailable && (weatherAvailable || weatherAlerts.length > 0 || roadAlerts.length > 0);
    const generatedAt = new Date().toISOString();
    const routeId = routeSignature(r.geometry);
    const mappedRisks = result.factors.map((f) => ({
      ...f,
      source:
        f.type === "closure"
          ? ("DOT" as const)
          : f.type === "hazard"
            ? ("Driver Report" as const)
            : ("Weather API" as const),
    }));
    const roadClosures = roadAlerts.filter((a) => a.category === "road_closure");
    const windRisks = [
      ...mappedRisks
        .filter((r) => r.type === "wind")
        .map((r, i) => ({ id: `risk-wind-${i}`, severity: r.severity, message: r.message, source: r.source })),
      ...weatherAlerts
        .filter((a) => a.category === "high_wind" || a.category === "tornado")
        .map((a) => ({ id: a.id, severity: a.severity, message: `${a.event} — ${a.areaDesc}`, source: "Weather API" as const })),
    ];
    const sharedResultCount = weatherAlerts.length + roadAlerts.length + driverReports.length + restAreas.pois.length + truckStops.pois.length + weighStations.pois.length;

    // Weather-impacted ETA: per-sample slowdown multipliers, averaged across
    // available samples and applied to the base routing duration.
    const impactSegments = weatherSamples.map((w) => {
      if (!w.available) {
        return { label: w.label, multiplier: 1, condition: "Unknown", reason: "No forecast", severity: "none" as const };
      }
      let mult = 1;
      const reasons: string[] = [];
      let sev: "none" | "minor" | "moderate" | "severe" = "none";
      const bump = (m: number, r: string, s: "minor" | "moderate" | "severe") => {
        mult *= m;
        reasons.push(r);
        const rank = { none: 0, minor: 1, moderate: 2, severe: 3 };
        if (rank[s] > rank[sev]) sev = s;
      };
      const c = w.condition.toLowerCase();
      if (c.includes("snow")) bump(1.3, "Snow", "severe");
      else if (c.includes("thunder")) bump(1.2, "Thunderstorms", "moderate");
      else if (c.includes("rain")) bump((w.precipMm ?? 0) > 5 ? 1.2 : 1.1, (w.precipMm ?? 0) > 5 ? "Heavy rain" : "Rain", (w.precipMm ?? 0) > 5 ? "moderate" : "minor");
      else if (c.includes("drizzle")) bump(1.05, "Drizzle", "minor");
      if (c.includes("fog") || (w.visibilityKm != null && w.visibilityKm < 1)) bump(1.25, "Low visibility", "moderate");
      else if (w.visibilityKm != null && w.visibilityKm < 5) bump(1.1, "Reduced visibility", "minor");
      if ((w.gustKph ?? 0) > 80) bump(1.1, "High wind gusts", "moderate");
      else if ((w.windKph ?? 0) > 60) bump(1.05, "Strong wind", "minor");
      return { label: w.label, multiplier: Math.round(mult * 100) / 100, condition: w.condition, reason: reasons.join(", ") || "Clear", severity: sev };
    });
    const availableSegs = impactSegments.filter((s, i) => weatherSamples[i].available);
    const avgMult = availableSegs.length > 0 ? availableSegs.reduce((s, x) => s + x.multiplier, 0) / availableSegs.length : 1;
    const adjustedDurationMin = Math.round(r.durationMin * avgMult);
    const weatherImpact = {
      baseDurationMin: r.durationMin,
      adjustedDurationMin,
      deltaMin: Math.max(0, adjustedDurationMin - Math.round(r.durationMin)),
      deltaPct: Math.round((avgMult - 1) * 100),
      available: availableSegs.length > 0,
      segments: impactSegments,
    };

    const totalMiles = r.distanceKm * 0.621371;
    const stateMileage = routeAvailable
      ? await computeStateMileage(r.geometry, totalMiles).catch(() => [] as StateSlice[])
      : [];

    return {
      origin: o,
      destination: d2,
      waypoints: validWaypoints,
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      geometry: r.geometry,
      routeStatus: !routeAvailable ? "unavailable" : r.truckRestrictionsVerified ? "ok" : "fallback",
      routeMessage: !routeAvailable ? ROUTE_NOT_CALCULATED_MESSAGE : r.warning,
      weather: weatherSamples,
      weatherAlerts,
      weatherAlertCount: weatherAlerts.length,
      roadAlertCount: roadAlerts.length,
      roadAlerts,
      roadClosures,
      windRisks,
      restAreas,
      truckStops,
      weighStations,
      driverReports,
      routeId,
      etaMin: adjustedDurationMin,
      weatherImpact,
      debug: {
        routeId,
        origin: o.name,
        destination: d2.name,
        polyline: r.geometry.slice(0, 12).map(([lon, lat]) => `${lat.toFixed(4)},${lon.toFixed(4)}`).join(" → ") + (r.geometry.length > 12 ? " …" : ""),
        polylinePointCount: r.geometry.length,
        desktopResultCount: sharedResultCount,
        mobileResultCount: sharedResultCount,
        apiResponseTimestamp: generatedAt,
        cacheStatus: "fresh",
      },
      risks: mappedRisks,
      breakdown: result.breakdown,
      score: haveAnyLiveData ? result.score : null,
      riskLevel: haveAnyLiveData ? result.riskLevel : null,
      scoreExplanation: haveAnyLiveData
        ? result.scoreExplanation
        : routeAvailable
          ? "No score calculated because live route weather and road data are unavailable."
          : ROUTE_NOT_CALCULATED_MESSAGE,
      recommendedAction: haveAnyLiveData
        ? result.recommendedAction
        : routeAvailable
          ? "Connect live weather and road data to calculate route safety."
          : ROUTE_NOT_CALCULATED_MESSAGE,
      generatedAt,
      dataAvailability: {
        weather: weatherAvailable,
        weatherAlerts: weatherAlerts.length > 0,
        road: roadAlerts.length > 0,
        truckRestrictions: r.truckRestrictionsVerified,
      },
      truckRestrictions: {
        connected: r.truckRestrictionsVerified,
        message:
          r.truckRestrictionsVerified
            ? (r.verifiedRestrictions.clearance || r.verifiedRestrictions.weight || r.verifiedRestrictions.hazmat
                ? "Truck route calculated with your saved dimensions. Always verify posted restrictions before departure."
                : "Truck route calculated, but no dimensions on profile — restrictions are not verified. Set height, weight, and hazmat in Profile › Truck Profile.")
            : (r.warning ?? "Truck restriction data not connected yet. Route not verified against bridge clearance, weight limits, or hazmat restrictions."),
        verified: r.verifiedRestrictions,
        profile: data.truckProfile
          ? {
              heightIn: data.truckProfile.heightIn ?? null,
              weightLbs: data.truckProfile.weightLbs ?? null,
              lengthFt: data.truckProfile.lengthFt ?? null,
              axles: data.truckProfile.axles ?? null,
              hazmat: !!data.truckProfile.hazmat,
              loaded: data.truckProfile.loaded ?? null,
            }
          : null,
      },
      providers: {
        weather: weatherAvailable ? "Open-Meteo" : "not_connected",
        weatherAlerts: "NWS",
        road: roadAlerts.length > 0 ? (roadAlerts[0]?.provider ?? "configured") : (process.env.TOMTOM_API_KEY ? "TomTom (no incidents on route)" : "not_connected"),
      },
      stateMileage,
    };
  });
