// SafetyScoreService — pure scoring logic, no I/O.
// Combines weather, wind, road-closure, and driver-report risk into a
// single 0–100 Route Safety Score.

import type { CurrentWeather, WeatherAlert } from "./weather.service";
import type { RoadAlert } from "./road-alert.service";

export type RiskBreakdown = {
  weather: number; // capped route-condition penalty, higher = worse
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
    penalty: number;
  }>;
  recommendedAction: string;
  riskLevel: "Safe" | "Caution" | "High Risk" | "Extreme";
  scoreExplanation: string;
};

function addPenalty(
  factors: SafetyResult["factors"],
  breakdown: RiskBreakdown,
  bucket: keyof RiskBreakdown,
  factor: Omit<SafetyResult["factors"][number], "penalty">,
  amount: number,
) {
  if (amount <= 0) return;
  const caps: RiskBreakdown = { weather: 25, wind: 30, closure: 30, hazard: 20 };
  const applied = Math.min(amount, Math.max(0, caps[bucket] - breakdown[bucket]));
  if (applied <= 0) return;
  breakdown[bucket] += applied;
  factors.push({ ...factor, penalty: applied });
}

function weatherAlertPenalty(alert: WeatherAlert): { bucket: keyof RiskBreakdown; amount: number } {
  if (alert.severity === "low") return { bucket: "weather", amount: 0 };
  if (alert.category === "tornado") return { bucket: "wind", amount: alert.severity === "critical" ? 30 : 25 };
  if (alert.category === "high_wind") {
    if (alert.severity === "critical") return { bucket: "wind", amount: 30 };
    if (alert.severity === "high") return { bucket: "wind", amount: 20 };
    return { bucket: "wind", amount: 10 };
  }
  if (alert.severity === "critical") return { bucket: "weather", amount: 25 };
  if (alert.severity === "high") return { bucket: "weather", amount: 15 };
  return { bucket: "weather", amount: 5 };
}

function roadPenalty(alert: RoadAlert): number {
  if (alert.category === "road_closure") {
    if (alert.severity === "critical") return 30;
    if (alert.severity === "high") return 25;
    if (alert.severity === "medium") return 20;
    return 10;
  }
  if (alert.category === "detour" || alert.category === "chain_restriction") {
    if (alert.severity === "critical" || alert.severity === "high") return 20;
    if (alert.severity === "medium") return 12;
    return 8;
  }
  if (alert.severity === "critical" || alert.severity === "high") return 10;
  return 0;
}

export function computeSafety(input: ScoredFactors): SafetyResult {
  const factors: SafetyResult["factors"] = [];
  const breakdown: RiskBreakdown = { weather: 0, wind: 0, closure: 0, hazard: 0 };

  for (const w of input.weatherSamples) {
    const gust = w.gustKph ?? 0;
    const wind = w.windKph ?? 0;
    if (gust >= 75) {
      addPenalty(factors, breakdown, "wind", { type: "wind", severity: "critical", message: `Dangerous wind gusts ${Math.round(gust)} km/h` }, 30);
    } else if (gust >= 55 || wind >= 45) {
      addPenalty(factors, breakdown, "wind", { type: "wind", severity: "high", message: `High wind ${Math.round(Math.max(gust, wind))} km/h` }, 18);
    } else if (gust >= 40 || wind >= 35) {
      addPenalty(factors, breakdown, "wind", { type: "wind", severity: "medium", message: `Elevated wind ${Math.round(Math.max(gust, wind))} km/h` }, 8);
    }

    const precip = w.precipMm ?? 0;
    if (precip >= 8) {
      addPenalty(factors, breakdown, "weather", { type: "precip", severity: "high", message: `${precip} mm heavy precipitation on route` }, 10);
    } else if (precip >= 3) {
      addPenalty(factors, breakdown, "weather", { type: "precip", severity: "medium", message: `${precip} mm precipitation on route` }, 5);
    } else if (precip >= 1) {
      addPenalty(factors, breakdown, "weather", { type: "precip", severity: "low", message: `${precip} mm light precipitation on route` }, 2);
    }

    if (w.condition === "Snow") {
      addPenalty(factors, breakdown, "weather", { type: "precip", severity: "high", message: "Snow on route" }, 15);
    }
    if (w.condition === "Thunderstorm") {
      addPenalty(factors, breakdown, "weather", { type: "precip", severity: "critical", message: "Thunderstorms on route" }, 20);
    }
    if (w.condition === "Fog" || (w.visibilityKm != null && w.visibilityKm < 1.6)) {
      addPenalty(factors, breakdown, "weather", { type: "visibility", severity: "medium", message: `Reduced visibility${w.visibilityKm != null ? ` ${w.visibilityKm} km` : ""}` }, 8);
    }
    if ((w.tempC ?? 20) <= -5 || (w.tempC ?? 20) >= 40) {
      addPenalty(factors, breakdown, "weather", { type: "temp", severity: "medium", message: `Extreme temperature ${Math.round(w.tempC!)}°C` }, 10);
    }
  }

  for (const a of input.weatherAlerts) {
    const p = weatherAlertPenalty(a);
    addPenalty(factors, breakdown, p.bucket, { type: "weather_alert", severity: a.severity, message: `${a.event} — ${a.areaDesc}` }, p.amount);
  }

  for (const r of input.roadAlerts) {
    addPenalty(factors, breakdown, "closure", { type: "closure", severity: r.severity, message: `${r.category.replace("_", " ")} on ${r.roadway}` }, roadPenalty(r));
  }

  if (input.driverReportCount > 0) {
    const penalty = Math.min(20, input.driverReportCount * 5);
    breakdown.hazard += penalty;
    factors.push({
      type: "hazard",
      severity: input.driverReportCount >= 3 ? "high" : "medium",
      message: `${input.driverReportCount} verified driver hazard${input.driverReportCount > 1 ? "s" : ""} nearby`,
      penalty,
    });
  }

  const totalPenalty = breakdown.weather + breakdown.wind + breakdown.closure + breakdown.hazard;
  const score = Math.max(0, Math.min(100, 100 - totalPenalty));

  const riskLevel: SafetyResult["riskLevel"] =
    score >= 85 ? "Safe" : score >= 70 ? "Caution" : score >= 45 ? "High Risk" : "Extreme";

  const scoreExplanation =
    factors.length === 0
      ? "Safe because route samples show no severe alerts, dangerous wind, road closures, extreme weather, or verified driver hazards."
      : `${riskLevel} because ${factors.map((f) => `${f.message} (−${f.penalty})`).join("; ")}.`;

  const recommendedAction =
    riskLevel === "Safe"
      ? "Safe — clear to roll. Standard pre-trip checks."
      : riskLevel === "Caution"
        ? "Caution — monitor listed conditions and reduce speed where needed."
        : riskLevel === "High Risk"
          ? "High risk — consider alternate routing or staging until hazards improve."
          : "Extreme — delay departure until conditions improve.";

  return { score, breakdown, factors, recommendedAction, riskLevel, scoreExplanation };
}
