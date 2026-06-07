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
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InputSchema = z.object({
  origin: z.string().trim().min(2).max(200),
  destination: z.string().trim().min(2).max(200),
  truck: z.string().max(60).optional(),
  trailer: z.string().max(60).optional(),
  originCoords: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
  destinationCoords: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
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
    .select("id,hazard_type,severity,location,description,reporter_id,latitude,longitude,created_at,status")
    .eq("status", "active")
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
      } satisfies RouteDriverReport;
    })
    .filter((h): h is RouteDriverReport => h != null)
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

export type RouteAnalysis = {
  origin: { name: string; lat: number; lon: number };
  destination: { name: string; lat: number; lon: number };
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
  weatherAlerts: Array<{
    id: string;
    category: "high_wind" | "tornado" | "winter_storm" | "flood" | "thunderstorm" | "visibility" | "severe_weather";
    event: string;
    severity: "low" | "medium" | "high" | "critical";
    areaDesc: string;
    headline: string;
    description: string;
    recommendedAction: string;
    effective: string;
    expires: string | null;
    lat: number | null;
    lon: number | null;
    provider: string;
    source: "weather_api";
  }>;
  weatherAlertCount: number;
  roadAlertCount: number;
  roadAlerts: Array<{
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
  }>;
  roadClosures: RouteAnalysis["roadAlerts"];
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
    const r = await getRoute(o, d2, { truckMode: true });
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

    // Per-point NWS alerts — sample densely along the route corridor so we
    // catch alerts between origin/midpoint/destination. Only alerts whose
    // polygon covers a route sample are returned.
    const alertSamples = sampleRoute(r.geometry, 20);
    const perPointAlerts = await Promise.all(
      alertSamples.map((s) => fetchAlertsForPoint(s.lat, s.lon).catch(() => [] as WeatherAlert[])),
    );
    const dedup = new Map<string, WeatherAlert>();
    for (const list of perPointAlerts) for (const a of list) dedup.set(a.id, a);
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
    const roadAlerts = await fetchRoadAlerts({ bbox }).catch(() => []);

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
      driverReportCount: 0,
      trailerType: data.trailer,
    });

    const haveAnyLiveData = routeAvailable && (weatherAvailable || weatherAlerts.length > 0 || roadAlerts.length > 0);

    return {
      origin: o,
      destination: d2,
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      geometry: r.geometry,
      routeStatus: !routeAvailable ? "unavailable" : r.truckRestrictionsVerified ? "ok" : "fallback",
      routeMessage: !routeAvailable ? ROUTE_NOT_CALCULATED_MESSAGE : r.warning,
      weather: weatherSamples,
      weatherAlerts: weatherAlerts.map((a) => ({
        id: a.id,
        event: a.event,
        severity: a.severity,
        areaDesc: a.areaDesc,
        headline: a.headline,
        recommendedAction: a.recommendedAction,
        effective: a.effective,
        provider: a.provider,
        source: "weather_api" as const,
      })),
      weatherAlertCount: weatherAlerts.length,
      roadAlertCount: roadAlerts.length,
      risks: result.factors.map((f) => ({
        ...f,
        source:
          f.type === "closure"
            ? ("DOT" as const)
            : f.type === "hazard"
              ? ("Driver Report" as const)
              : ("Weather API" as const),
      })),
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
      generatedAt: new Date().toISOString(),
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
            ? "Truck route calculated with truck routing enabled. Always verify posted restrictions before departure."
            : (r.warning ?? "Truck restriction data not connected yet. Route not verified against bridge clearance, weight limits, or hazmat restrictions."),
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
    };
  });
