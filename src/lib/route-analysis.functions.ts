import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geocode, getRoute, sampleRoute } from "./services/route-analysis.service";
import { fetchCurrentWeather, fetchSevereWeatherAlerts } from "./services/weather.service";
import { computeSafety } from "./services/safety-score.service";
import { fetchRoadAlerts } from "./services/road-alert.service";

const InputSchema = z.object({
  origin: z.string().trim().min(2).max(200),
  destination: z.string().trim().min(2).max(200),
  truck: z.string().max(60).optional(),
  trailer: z.string().max(60).optional(),
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
  }>;
  weatherAlertCount: number;
  roadAlertCount: number;
  risks: Array<{
    type: "wind" | "precip" | "closure" | "hazard" | "temp" | "visibility" | "weather_alert";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
  }>;
  breakdown: { weather: number; wind: number; closure: number; hazard: number };
  score: number;
  recommendedAction: string;
};

export const analyzeRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<RouteAnalysis> => {
    const [o, d2] = await Promise.all([geocode(data.origin), geocode(data.destination)]);
    const r = await getRoute(o, d2);

    const samples = sampleRoute(r.geometry, 3);
    const labels = ["Origin", "Midpoint", "Destination"];
    const weatherSamples = await Promise.all(
      samples.map(async (s, i) => {
        const w = await fetchCurrentWeather(s.lat, s.lon);
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
        };
      }),
    );

    const [weatherAlerts, roadAlerts] = await Promise.all([
      fetchSevereWeatherAlerts().catch(() => []),
      fetchRoadAlerts().catch(() => []),
    ]);

    const result = computeSafety({
      weatherSamples,
      weatherAlerts,
      roadAlerts,
      driverReportCount: 0,
      trailerType: data.trailer,
    });

    return {
      origin: o,
      destination: d2,
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      geometry: r.geometry,
      weather: weatherSamples,
      weatherAlertCount: weatherAlerts.length,
      roadAlertCount: roadAlerts.length,
      risks: result.factors,
      breakdown: result.breakdown,
      score: result.score,
      recommendedAction: result.recommendedAction,
    };
  });
