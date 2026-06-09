import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchAlertsForPoint, type WeatherAlert } from "./services/weather.service";
import { fetchRoadAlerts, type RoadAlert } from "./services/road-alert.service";
import { sampleRoute } from "./services/route-analysis.service";

export type SafetyFeed = {
  weatherAlerts: WeatherAlert[];
  roadAlerts: RoadAlert[];
  generatedAt: string;
  providers: { weather: string; road: string };
  scope: "route" | "none";
};

const InputSchema = z.object({
  geometry: z
    .array(z.tuple([z.number(), z.number()]))
    .min(2)
    .max(20000)
    .optional(),
});

/**
 * Live safety feed scoped to the active route corridor.
 * - NWS alerts: queried per-sample-point along the route geometry, then deduped.
 *   Only alerts whose polygon covers the route are returned.
 * - Road alerts (TomTom): queried within the route bbox.
 * Without a route geometry, returns an empty feed — we no longer return
 * nationwide alerts.
 */
export const getSafetyFeed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<SafetyFeed> => {
    const geometry = data.geometry ?? [];
    if (geometry.length < 2) {
      return {
        weatherAlerts: [],
        roadAlerts: [],
        generatedAt: new Date().toISOString(),
        providers: { weather: "NWS", road: "TomTom" },
        scope: "none",
      };
    }

    // Sample along the route — dense enough to catch alerts between endpoints
    // but bounded to avoid hammering NWS. NWS rate-limits aggressively; if we
    // fan out a large `Promise.all` it silently drops responses to [], which
    // is the exact failure mode that made route alerts "disappear" in the UI.
    // Run in small sequential batches instead.
    const samples = sampleRoute(geometry, 10);

    // Route bbox for road-alert provider.
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of geometry) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
    const bbox: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];

    const dedup = new Map<string, WeatherAlert>();
    const weatherTask = (async () => {
      const batchSize = 3;
      for (let i = 0; i < samples.length; i += batchSize) {
        const batch = samples.slice(i, i + batchSize);
        const lists = await Promise.all(
          batch.map((s) => fetchAlertsForPoint(s.lat, s.lon).catch(() => [] as WeatherAlert[])),
        );
        for (const list of lists) for (const a of list) dedup.set(a.id, a);
      }
    })();
    const [, roadAlerts] = await Promise.all([
      weatherTask,
      fetchRoadAlerts({ bbox }).catch(() => [] as RoadAlert[]),
    ]);
    const weatherAlerts = Array.from(dedup.values());


    return {
      weatherAlerts,
      roadAlerts,
      generatedAt: new Date().toISOString(),
      providers: { weather: "NWS", road: roadAlerts.length ? (roadAlerts[0]?.provider ?? "TomTom") : "TomTom" },
      scope: "route",
    };
  });
