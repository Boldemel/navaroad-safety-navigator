import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geocode, getRoute, sampleRoute } from "./services/route-analysis.service";
import {
  fetchCurrentWeather,
  fetchAlertsForPoint,
  type WeatherAlert,
} from "./services/weather.service";
import { computeSafety } from "./services/safety-score.service";
import { fetchRoadAlerts } from "./services/road-alert.service";

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
});

export type RouteAnalysis = {
  origin: { name: string; lat: number; lon: number };
  destination: { name: string; lat: number; lon: number };
  distanceKm: number;
  durationMin: number;
  geometry: Array<[number, number]>;
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
    event: string;
    severity: "low" | "medium" | "high" | "critical";
    areaDesc: string;
    headline: string;
    recommendedAction: string;
    effective: string;
    provider: string;
    source: "weather_api";
  }>;
  weatherAlertCount: number;
  roadAlertCount: number;
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
    const r = await getRoute(o, d2);

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

    const haveAnyLiveData = weatherAvailable || weatherAlerts.length > 0 || roadAlerts.length > 0;

    return {
      origin: o,
      destination: d2,
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      geometry: r.geometry,
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
        : "No score calculated because live route weather and road data are unavailable.",
      recommendedAction: haveAnyLiveData
        ? result.recommendedAction
        : "Connect live weather and road data to calculate route safety.",
      generatedAt: new Date().toISOString(),
      dataAvailability: {
        weather: weatherAvailable,
        weatherAlerts: weatherAlerts.length > 0,
        road: roadAlerts.length > 0,
        truckRestrictions: false,
      },
      truckRestrictions: {
        connected: false,
        message:
          "Truck restriction data not connected yet. Route not verified against bridge clearance, weight limits, or hazmat restrictions.",
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
