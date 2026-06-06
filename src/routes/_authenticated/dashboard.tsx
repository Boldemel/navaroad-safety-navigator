import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wind, Construction, AlertTriangle, Route as RouteIcon, ShieldCheck, Loader2,
  CloudRain, Thermometer, MapPin, Radio, Users, Cloud, Lightbulb, Info,
} from "lucide-react";
import { TRUCK_TYPES, TRAILER_TYPES, severityClasses } from "@/lib/navaroad";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { analyzeRoute } from "@/lib/route-analysis.functions";
import { getSafetyFeed } from "@/lib/safety-engine.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [truck, setTruck] = useState("Sleeper");
  const [trailer, setTrailer] = useState("Dry Van");
  useRealtimeInvalidate(["hazard_reports"], [["dash-hazards"]]);

  const analyzeFn = useServerFn(analyzeRoute);
  const feedFn = useServerFn(getSafetyFeed);

  const analysis = useMutation({
    mutationFn: (vars: { origin: string; destination: string; truck: string; trailer: string }) =>
      analyzeFn({ data: vars }),
  });

  // Live API-driven safety feed (weather + DOT).
  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ["safety-feed"],
    queryFn: () => feedFn(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const { data: hazards = [] } = useQuery({
    queryKey: ["dash-hazards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hazard_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const result = analysis.data;

  // Stat cards: prefer the analyzed route when present, else fall back to the
  // live national feed. This keeps Wind/Weather Risk specific to the path.
  const routeRisks = result?.risks ?? [];
  const feedWeatherAlerts = feed?.weatherAlerts ?? [];
  const feedRoadAlerts = feed?.roadAlerts ?? [];
  const usingRoute = !!result;
  const weatherCount = usingRoute
    ? routeRisks.filter((r) => r.type === "precip" || r.type === "visibility" || r.type === "temp" || r.type === "weather_alert").length
    : feedWeatherAlerts.length;
  const windCount = usingRoute
    ? routeRisks.filter((r) => r.type === "wind").length + feedWeatherAlerts.filter((a) => result && result.weatherAlerts.some((x) => x.id === a.id) && (a.category === "high_wind" || a.category === "tornado")).length
    : feedWeatherAlerts.filter((a) => a.category === "high_wind" || a.category === "tornado").length;
  const closureCount = usingRoute
    ? routeRisks.filter((r) => r.type === "closure").length
    : feedRoadAlerts.filter((a) => a.category === "road_closure" || a.category === "detour").length;
  const driverCount = hazards.length;

  const score = result?.score ?? null;
  const breakdown = result?.breakdown;
  const trailerBump = ["Dry Van", "Reefer", "Curtain Side"].includes(trailer) ? 6 : 2;
  const totalPenalty = breakdown ? breakdown.weather + breakdown.wind + breakdown.closure + breakdown.hazard + trailerBump : 0;

  function onAnalyze(e: React.FormEvent) {
    e.preventDefault();
    analysis.mutate({ origin, destination, truck, trailer });
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Live safety intelligence from weather, road, and driver sources.</p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-full border border-border bg-card px-3 py-1.5">
          <Radio className={`size-3 ${feedLoading ? "text-muted-foreground animate-pulse" : "text-success"}`} />
          {feedLoading ? "Connecting to live sources…" : `Live: NWS weather · DOT ${feed?.providers.road === "not_connected" ? "not connected" : "live"}`}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={onAnalyze} className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <RouteIcon className="size-4 text-primary" />
            <h2 className="font-semibold">Route Analysis</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Origin</Label>
              <Input required value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Denver, CO" />
            </div>
            <div className="space-y-1.5">
              <Label>Destination</Label>
              <Input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Salt Lake City, UT" />
            </div>
            <div className="space-y-1.5">
              <Label>Truck Type</Label>
              <Select value={truck} onValueChange={setTruck}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRUCK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trailer Type</Label>
              <Select value={trailer} onValueChange={setTrailer}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRAILER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={analysis.isPending} className="w-full sm:w-auto">
            {analysis.isPending ? (<><Loader2 className="size-4 mr-2 animate-spin" />Analyzing…</>) : "Analyze Route"}
          </Button>
          {analysis.isError && (
            <div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">
              {(analysis.error as Error).message || "Failed to analyze route."}
            </div>
          )}
          {result && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span><MapPin className="inline size-3.5 mr-1" />{Math.round(result.distanceKm)} km</span>
                <span>~{Math.round(result.durationMin)} min drive</span>
                <span>{result.weatherAlertCount} weather alerts · {result.roadAlertCount} DOT alerts on path</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Data as of {new Date(result.generatedAt).toLocaleString()} ·
                {" "}Weather: {result.dataAvailability.weather ? `live (${result.providers.weather})` : "not connected"} ·
                {" "}NWS alerts: live ·
                {" "}DOT: {result.dataAvailability.road ? `live (${result.providers.road})` : "not connected"}
              </div>
              {!result.dataAvailability.weather && (
                <div className="text-sm text-muted-foreground border border-border bg-muted/30 rounded-md p-3">
                  Live weather data not connected yet.
                </div>
              )}
              <div className="grid sm:grid-cols-3 gap-2">
                {result.weather.map((w) => (
                  <div key={w.label} className="rounded-md border border-border bg-background p-3 text-xs space-y-1">
                    <div className="font-medium text-sm text-foreground">{w.label}</div>
                    {w.available ? (
                      <>
                        <div className="text-muted-foreground">{w.condition}</div>
                        <div className="flex items-center gap-2"><Thermometer className="size-3" />{w.tempC != null ? `${Math.round(w.tempC)}°C` : "—"}</div>
                        <div className="flex items-center gap-2"><Wind className="size-3" />{w.windKph != null ? `${Math.round(w.windKph)} km/h` : "—"}{w.gustKph != null && ` (gust ${Math.round(w.gustKph)})`}</div>
                        <div className="flex items-center gap-2"><CloudRain className="size-3" />{w.precipMm != null ? `${w.precipMm} mm` : "—"}</div>
                      </>
                    ) : (
                      <div className="text-muted-foreground">Live weather data not connected yet.</div>
                    )}
                  </div>
                ))}
              </div>
              {result.weatherAlerts.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Active alerts on this route</div>
                  {result.weatherAlerts.map((a) => (
                    <div key={a.id} className="flex items-start gap-2 text-sm rounded-md border border-border bg-background p-2">
                      <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(a.severity)}`}>{a.severity}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{a.event} — {a.areaDesc}</div>
                        <div className="text-[11px] text-muted-foreground">Source: NWS · Effective {new Date(a.effective).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {result.risks.length > 0 ? (
                <ul className="space-y-1.5">
                  {result.risks.slice(0, 8).map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(r.severity)}`}>{r.severity}</span>
                      <span className="flex-1">{r.message}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{r.source}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                result.dataAvailability.weather && <p className="text-sm text-success">No major weather or road risks detected on this route.</p>
              )}
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                <span className="font-medium text-primary inline-flex items-center gap-1.5"><Lightbulb className="size-3.5" />Recommended action:</span>{" "}
                <span className="text-foreground">{result.recommendedAction}</span>
              </div>
            </div>
          )}
        </form>

        <div className="rounded-xl border border-border bg-card p-5 flex flex-col text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" /> Route Safety Score
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="How is this calculated?" className="text-muted-foreground hover:text-foreground">
                  <Info className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 text-xs text-left space-y-2">
                <div className="font-semibold text-sm">How the score is calculated</div>
                <p>Start at <strong>98</strong>. Subtract penalties from four live sources, then subtract a small trailer-profile bump.</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li><strong>Weather</strong> (Open-Meteo per route sample): precip ≥5 mm = 10, ≥1 mm = 4, snow = 14, thunderstorm = 20, fog / vis &lt; 1 km = 8, temp ≤ −5 °C = 6.</li>
                  <li><strong>Wind</strong> (Open-Meteo): gusts ≥75 km/h = 28, ≥55 km/h or wind ≥45 km/h = 14, wind ≥30 km/h = 5.</li>
                  <li><strong>NWS alerts</strong> intersecting route: critical 35 · high 18 · medium 8 · low 3 (wind/tornado count toward wind).</li>
                  <li><strong>Road closures</strong> (DOT, when connected): same severity weights.</li>
                  <li><strong>Driver reports</strong> nearby: up to 20.</li>
                  <li><strong>Trailer profile</strong>: high-wind-sensitive trailers add 6, others 2.</li>
                </ul>
                <p>Final score is clamped 20–99. Score = 98 − (weather + wind + closure + hazard + trailer).</p>
              </PopoverContent>
            </Popover>
          </div>
          <div className={`mt-3 text-6xl font-bold ${score == null ? "text-muted-foreground" : score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive"}`}>
            {analysis.isPending ? <Loader2 className="size-12 animate-spin mx-auto" /> : (score ?? "—")}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {score == null ? "Analyze a route to see your score." : result?.recommendedAction}
          </p>
          {breakdown && score != null && (
            <div className="mt-4 pt-4 border-t border-border text-left space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Breakdown (penalties)</div>
              <BreakdownRow label="Weather" value={breakdown.weather} source="Open-Meteo" />
              <BreakdownRow label="Wind" value={breakdown.wind} source="Open-Meteo" />
              <BreakdownRow label="Road closures" value={breakdown.closure} source={result?.providers.road ?? "not connected"} />
              <BreakdownRow label="Driver reports" value={breakdown.hazard} source="Community" />
              <BreakdownRow label={`Trailer (${trailer})`} value={trailerBump} source="Profile" />
              <div className="flex justify-between text-xs pt-1.5 mt-1.5 border-t border-border">
                <span className="font-medium">98 − {totalPenalty} =</span>
                <span className="font-semibold">{score}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-3">
          Live safety signals {usingRoute && <span className="text-xs text-muted-foreground font-normal">· filtered to your route</span>}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Cloud className="size-5" />} label="Weather Risk" count={weatherCount} sub={usingRoute ? "On this route (Open-Meteo + NWS)" : "Active NWS alerts (national)"} accent="primary" loading={feedLoading} />
          <StatCard icon={<Wind className="size-5" />} label="Wind Risk" count={windCount} sub={usingRoute ? "Wind/gust risks on this route" : "Active high-wind / tornado (NWS)"} accent="primary" loading={feedLoading} />
          <StatCard icon={<Construction className="size-5" />} label="DOT / Road Closure Risk" count={closureCount} sub={feed?.providers.road === "not_connected" ? "Connect DOT API" : usingRoute ? "Closures on this route" : "Active closures"} accent="destructive" loading={feedLoading} />
          <StatCard icon={<Users className="size-5" />} label="Driver Reports" count={driverCount} sub="Community layer · live" accent="warning" />
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-3">Recent live alerts</h2>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {feedLoading && <div className="p-6 text-sm text-muted-foreground">Loading live alerts…</div>}
          {!feedLoading && feedWeatherAlerts.length === 0 && feedRoadAlerts.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground inline-flex items-center gap-2">
              <AlertTriangle className="size-4" /> No active weather or road alerts from connected sources.
            </div>
          )}
          {feedWeatherAlerts.slice(0, 5).map((a) => (
            <div key={a.id} className="p-4 flex items-start gap-3">
              <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(a.severity)}`}>{a.severity}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{a.event} — {a.areaDesc}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.headline}</div>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap px-2 py-0.5 rounded border border-border">Weather · {a.provider}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, count, sub, accent, loading }: { icon: React.ReactNode; label: string; count: number; sub?: string; accent: "primary" | "destructive" | "warning"; loading?: boolean }) {
  const colors = {
    primary: "text-primary bg-primary/10 border-primary/20",
    destructive: "text-destructive bg-destructive/10 border-destructive/20",
    warning: "text-warning bg-warning/10 border-warning/20",
  }[accent];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className={`size-10 rounded-md flex items-center justify-center border ${colors}`}>{icon}</div>
      <div className="mt-4 text-3xl font-semibold">{loading ? <Loader2 className="size-7 animate-spin" /> : count}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</div>}
    </div>
  );
}

function BreakdownRow({ label, value, source }: { label: string; value: number; source: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground/70">{source}</span>
        <span className={`font-mono tabular-nums ${value > 0 ? "text-destructive" : "text-muted-foreground"}`}>−{value}</span>
      </span>
    </div>
  );
}
