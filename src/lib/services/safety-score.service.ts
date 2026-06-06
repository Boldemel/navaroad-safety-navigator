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
  const event = alert.event.toLowerCase();
  const isWarning = event.includes("warning") || event.includes("emergency");
  const isWatch = event.includes("watch");
  const isAdvisory = event.includes("advisory") || event.includes("statement") || event.includes("outlook");
  if (alert.severity === "low") return { bucket: "weather", amount: 0 };
  if (alert.category === "tornado") return { bucket: "wind", amount: alert.severity === "critical" ? 30 : 25 };
  if (alert.category === "high_wind") {
    if (isWarning && alert.severity === "critical") return { bucket: "wind", amount: 30 };
    if (isWarning || alert.severity === "high") return { bucket: "wind", amount: isWatch || isAdvisory ? 8 : 20 };
    return { bucket: "wind", amount: 10 };
  }
  if (isWatch || isAdvisory) return { bucket: "weather", amount: alert.severity === "high" ? 5 : 0 };
  if (!isWarning && alert.severity === "medium") return { bucket: "weather", amount: 5 };
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

  // Score-derived level
  let riskLevel: SafetyResult["riskLevel"] =
    score >= 85 ? "Safe" : score >= 70 ? "Caution" : score >= 45 ? "High Risk" : "Extreme";

  // Floor risk level based on active NWS alert types / road closures along the route.
  // A route is never "Safe" while any active alert is present.
  const order: SafetyResult["riskLevel"][] = ["Safe", "Caution", "High Risk", "Extreme"];
  const raise = (lvl: SafetyResult["riskLevel"]) => {
    if (order.indexOf(lvl) > order.indexOf(riskLevel)) riskLevel = lvl;
  };
  const windSensitiveTrailer = /high|cube|box|reefer|dry van|car hauler|flatbed/i.test(
    input.trailerType ?? "",
  );

  for (const a of input.weatherAlerts) {
    const ev = a.event.toLowerCase();
    const isWarning = ev.includes("warning") || ev.includes("emergency");
    if (a.category === "tornado") raise(isWarning ? "Extreme" : "High Risk");
    else if (a.category === "high_wind") {
      if (isWarning) raise(windSensitiveTrailer ? "Extreme" : "High Risk");
      else raise("Caution");
    } else if (a.category === "winter_storm") raise(isWarning ? "High Risk" : "Caution");
    else if (a.category === "flood") raise(isWarning ? "High Risk" : "Caution");
    else if (a.category === "thunderstorm") {
      if (isWarning || a.severity === "critical") raise("High Risk");
      else raise("Caution");
    } else if (a.severity === "critical") raise("High Risk");
    else raise("Caution");
  }
  for (const r of input.roadAlerts) {
    if (r.category === "road_closure") raise(r.severity === "critical" ? "Extreme" : "High Risk");
    else if (r.severity === "critical" || r.severity === "high") raise("Caution");
  }

  // Build simplified explanation — alert type, region, source, action.
  // Do NOT list every county.
  const summarizeRegion = (areaDesc: string): string => {
    // Try to extract 2-letter state codes from text like "Adams, IL; Cook, IL"
    const states = Array.from(new Set((areaDesc.match(/\b[A-Z]{2}\b/g) ?? []))).slice(0, 3);
    if (states.length) return states.join(", ");
    const parts = areaDesc.split(";").map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 1) return areaDesc;
    return `${parts.length} areas along route`;
  };

  // Group alerts by event name
  const grouped = new Map<string, { provider: string; regions: Set<string>; action: string }>();
  for (const a of input.weatherAlerts) {
    const g = grouped.get(a.event) ?? {
      provider: a.provider,
      regions: new Set<string>(),
      action: a.recommendedAction,
    };
    g.regions.add(summarizeRegion(a.areaDesc));
    grouped.set(a.event, g);
  }

  const alertParts: string[] = [];
  for (const [event, g] of grouped) {
    const regions = Array.from(g.regions).slice(0, 2).join("; ");
    alertParts.push(`${event} (${regions || "along route"}, source: ${g.provider})`);
  }
  const closureCount = input.roadAlerts.filter((r) => r.category === "road_closure").length;
  if (closureCount > 0) {
    const provider = input.roadAlerts[0]?.provider ?? "DOT";
    alertParts.push(`${closureCount} road closure${closureCount > 1 ? "s" : ""} (source: ${provider})`);
  }

  let scoreExplanation: string;
  if (alertParts.length === 0 && factors.length === 0) {
    scoreExplanation =
      "Safe — no active weather alerts, dangerous wind, road closures, or verified hazards on the analyzed route.";
  } else if (alertParts.length > 0) {
    const headline =
      riskLevel === "Extreme"
        ? "Extreme"
        : riskLevel === "High Risk"
          ? "High Risk"
          : "Caution";
    const recAction =
      riskLevel === "Extreme"
        ? "Delay departure until conditions improve."
        : riskLevel === "High Risk"
          ? "Re-route or stage until hazards improve."
          : "Check timing before departure and monitor conditions.";
    scoreExplanation = `${headline}: ${alertParts.join(" and ")} active along parts of the route. ${recAction}`;
  } else {
    scoreExplanation = `${riskLevel} — route conditions show ${factors
      .map((f) => f.message.toLowerCase())
      .slice(0, 3)
      .join("; ")}.`;
  }

  const recommendedAction =
    riskLevel === "Safe"
      ? "Safe — clear to roll. Standard pre-trip checks."
      : riskLevel === "Caution"
        ? "Caution — active weather alerts along this route. Monitor and adjust as needed."
        : riskLevel === "High Risk"
          ? "High risk — consider alternate routing or staging until hazards improve."
          : "Extreme — delay departure until conditions improve.";

  return { score, breakdown, factors, recommendedAction, riskLevel, scoreExplanation };
}

