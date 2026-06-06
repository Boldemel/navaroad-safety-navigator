// SafetyScoreService — pure scoring logic, no I/O.
// Combines weather, wind, road-closure, and driver-report risk into a
// single 0–100 Route Safety Score.

import type { CurrentWeather, WeatherAlert } from "./weather.service";
import type { RoadAlert } from "./road-alert.service";

export type RiskBreakdown = {
  weather: number; // 0–100 risk (higher = worse)
  wind: number;
  closure: number;
  hazard: number;
};

export type ScoredFactors = {
  weatherSamples: CurrentWeather[];
  weatherAlerts: WeatherAlert[];
  roadAlerts: RoadAlert[];
  driverReportCount: number;
  trailerType?: string;
};

export type SafetyResult = {
  score: number; // 0–100, higher = safer
  breakdown: RiskBreakdown;
  factors: Array<{
    type: "wind" | "precip" | "closure" | "hazard" | "temp" | "visibility" | "weather_alert";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
  }>;
  recommendedAction: string;
};

function sevWeight(s: WeatherAlert["severity"] | RoadAlert["severity"]): number {
  switch (s) {
    case "critical":
      return 35;
    case "high":
      return 18;
    case "medium":
      return 8;
    default:
      return 3;
  }
}

export function computeSafety(input: ScoredFactors): SafetyResult {
  const factors: SafetyResult["factors"] = [];
  const breakdown: RiskBreakdown = { weather: 0, wind: 0, closure: 0, hazard: 0 };

  for (const w of input.weatherSamples) {
    const gust = w.gustKph ?? 0;
    const wind = w.windKph ?? 0;
    if (gust >= 75) {
      breakdown.wind += 28;
      factors.push({ type: "wind", severity: "critical", message: `Severe gusts ${Math.round(gust)} km/h` });
    } else if (gust >= 55 || wind >= 45) {
      breakdown.wind += 14;
      factors.push({ type: "wind", severity: "high", message: `High wind ${Math.round(Math.max(gust, wind))} km/h` });
    } else if (wind >= 30) {
      breakdown.wind += 5;
      factors.push({ type: "wind", severity: "medium", message: "Moderate wind" });
    }

    const precip = w.precipMm ?? 0;
    if (precip >= 5) {
      breakdown.weather += 10;
      factors.push({ type: "precip", severity: "high", message: "Heavy precipitation" });
    } else if (precip >= 1) {
      breakdown.weather += 4;
      factors.push({ type: "precip", severity: "medium", message: "Rain on route" });
    }

    if (w.condition === "Snow") {
      breakdown.weather += 14;
      factors.push({ type: "precip", severity: "high", message: "Snow on route" });
    }
    if (w.condition === "Thunderstorm") {
      breakdown.weather += 20;
      factors.push({ type: "precip", severity: "critical", message: "Thunderstorms on route" });
    }
    if (w.condition === "Fog" || (w.visibilityKm != null && w.visibilityKm < 1)) {
      breakdown.weather += 8;
      factors.push({ type: "visibility", severity: "medium", message: "Reduced visibility" });
    }
    if ((w.tempC ?? 99) <= -5) {
      breakdown.weather += 6;
      factors.push({ type: "temp", severity: "medium", message: `Freezing temps ${Math.round(w.tempC!)}°C` });
    }
  }

  for (const a of input.weatherAlerts) {
    const w = sevWeight(a.severity);
    if (a.category === "high_wind" || a.category === "tornado") breakdown.wind += w;
    else breakdown.weather += w;
    factors.push({ type: "weather_alert", severity: a.severity, message: `${a.event} — ${a.areaDesc}` });
  }

  for (const r of input.roadAlerts) {
    const w = sevWeight(r.severity);
    breakdown.closure += w;
    factors.push({ type: "closure", severity: r.severity, message: `${r.category.replace("_", " ")} on ${r.roadway}` });
  }

  if (input.driverReportCount > 0) {
    breakdown.hazard += Math.min(20, input.driverReportCount * 4);
    factors.push({
      type: "hazard",
      severity: input.driverReportCount >= 3 ? "high" : "medium",
      message: `${input.driverReportCount} driver-reported hazard${input.driverReportCount > 1 ? "s" : ""} nearby`,
    });
  }

  const trailerBump = ["Dry Van", "Reefer", "Curtain Side"].includes(input.trailerType ?? "") ? 6 : 2;
  const totalPenalty =
    breakdown.weather + breakdown.wind + breakdown.closure + breakdown.hazard + trailerBump;
  const score = Math.max(20, Math.min(99, 98 - totalPenalty));

  const recommendedAction =
    score >= 80
      ? "Low risk — clear to roll. Standard pre-trip checks."
      : score >= 60
      ? "Caution — review alerts, reduce speed in risk zones, monitor weather."
      : score >= 40
      ? "High risk — consider alt route, stage if conditions worsen, brief dispatch."
      : "Severe risk — recommend delay until conditions improve.";

  return { score, breakdown, factors, recommendedAction };
}
