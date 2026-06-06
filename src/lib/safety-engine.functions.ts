import { createServerFn } from "@tanstack/react-start";
import { fetchSevereWeatherAlerts, type WeatherAlert } from "./services/weather.service";
import { fetchRoadAlerts, type RoadAlert } from "./services/road-alert.service";

export type SafetyFeed = {
  weatherAlerts: WeatherAlert[];
  roadAlerts: RoadAlert[];
  generatedAt: string;
  providers: { weather: string; road: string };
};

/**
 * Live safety feed powered by the National Weather Service (severe weather)
 * and the road-alert provider (currently a placeholder until a DOT/HERE/TomTom
 * key is connected). Driver reports come from Supabase and are merged on the
 * client side.
 */
export const getSafetyFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<SafetyFeed> => {
    const [weatherAlerts, roadAlerts] = await Promise.all([
      fetchSevereWeatherAlerts().catch(() => []),
      fetchRoadAlerts().catch(() => []),
    ]);
    return {
      weatherAlerts,
      roadAlerts,
      generatedAt: new Date().toISOString(),
      providers: { weather: "NWS", road: roadAlerts.length ? "configured" : "not_connected" },
    };
  },
);
