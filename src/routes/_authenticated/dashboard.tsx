import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wind, Construction, AlertTriangle, Route as RouteIcon, ShieldCheck, Loader2,
  CloudRain, Thermometer, MapPin, Radio, Users, Cloud, Lightbulb, Info, LocateFixed,
  Navigation2, Fuel, ParkingCircle, ShieldAlert, Truck, Scale,
} from "lucide-react";

import { TRUCK_TYPES, TRAILER_TYPES, severityClasses } from "@/lib/navaroad";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { analyzeRoute } from "@/lib/route-analysis.functions";
import { getSafetyFeed } from "@/lib/safety-engine.functions";
import { useActiveRoute, saveActiveRoute, clearActiveRoute } from "@/hooks/use-active-route";
import { useGeolocation } from "@/hooks/use-geolocation";
import { reverseGeocode } from "@/lib/geo.functions";
import { getTruckRoute } from "@/lib/navigation.functions";
import { startNavigation, useNavigationSession, stopNavigation } from "@/hooks/use-navigation-session";
import { AddressAutocomplete, type SelectedPlace, type FavoriteSuggestion } from "@/components/address-autocomplete";
import { useFavoriteLocations } from "@/components/favorite-locations-card";
import { favoriteCategoryLabel } from "@/lib/favorite-locations";
import { searchTruckPois } from "@/lib/poi-search.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});



function Dashboard() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPlace, setOriginPlace] = useState<SelectedPlace | null>(null);
  const [destPlace, setDestPlace] = useState<SelectedPlace | null>(null);
  const [truck, setTruck] = useState("Sleeper");
  const [trailer, setTrailer] = useState("Dry Van");
  useRealtimeInvalidate(["hazard_reports"], [["dash-hazards"]]);

  const analyzeFn = useServerFn(analyzeRoute);
  const feedFn = useServerFn(getSafetyFeed);
  const reverseGeocodeFn = useServerFn(reverseGeocode);
  const truckRouteFn = useServerFn(getTruckRoute);
  const searchPoisFn = useServerFn(searchTruckPois);
  const activeRoute = useActiveRoute();
  const queryClient = useQueryClient();
  const geo = useGeolocation();
  const router = useRouter();
  const navSession = useNavigationSession();
  const [locating, setLocating] = useState(false);
  const [awaitingCoords, setAwaitingCoords] = useState(false);
  const [poiDialog, setPoiDialog] = useState<{ title: string; result: PoiDialogResult | null } | null>(null);
  const [analyzedRouteKey, setAnalyzedRouteKey] = useState<string | null>(null);

  function routeInputKey(
    originText: string,
    destinationText: string,
    originCoords?: { lat: number; lon: number } | null,
    destinationCoords?: { lat: number; lon: number } | null,
  ) {
    const coords = (p?: { lat: number; lon: number } | null) => p ? `${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : "none";
    return `${originText.trim()}|${destinationText.trim()}|${coords(originCoords)}|${coords(destinationCoords)}`;
  }

  function sampleRouteGeometry(geom: Array<[number, number]>, maxPoints: number) {
    if (geom.length <= maxPoints) return geom;
    const sampled: Array<[number, number]> = [];
    for (let i = 0; i < maxPoints; i++) {
      sampled.push(geom[Math.floor((i / (maxPoints - 1)) * (geom.length - 1))]);
    }
    return sampled;
  }

  function routeSignature(geom: Array<[number, number]>) {
    if (geom.length < 2) return "none";
    let hash = 0;
    for (const [lon, lat] of sampleRouteGeometry(geom, 40)) {
      const part = `${lon.toFixed(4)},${lat.toFixed(4)}`;
      for (let i = 0; i < part.length; i++) hash = (hash * 31 + part.charCodeAt(i)) >>> 0;
    }
    return `${geom.length}:${hash.toString(16)}`;
  }

  const [pendingAutoAnalyze, setPendingAutoAnalyze] = useState(false);

  // Load truck profile from Supabase so analysis uses driver-saved dimensions.
  const { data: profile } = useQuery({
    queryKey: ["truck-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });
  useEffect(() => {
    if (profile?.truck_type) setTruck(profile.truck_type);
    if (profile?.trailer_type) setTrailer(profile.trailer_type);
  }, [profile?.truck_type, profile?.trailer_type]);

  const truckProfile = {
    heightIn: profile?.truck_height_in ?? null,
    weightLbs: profile?.truck_weight_lbs ?? null,
    lengthFt: profile?.truck_length_ft ?? null,
    axles: profile?.truck_axles ?? null,
    hazmat: !!profile?.truck_hazmat,
    loaded: profile?.load_status === "loaded",
  };

  // Saved locations → autocomplete suggestions.
  const { data: favorites = [] } = useFavoriteLocations();
  const favSuggestions: FavoriteSuggestion[] = favorites
    .filter((f) => f.latitude != null && f.longitude != null)
    .map((f) => ({
      id: f.id,
      customLabel: f.label,
      categoryLabel: favoriteCategoryLabel(f.category),
      label: f.address,
      lat: f.latitude as number,
      lon: f.longitude as number,
      city: f.city ?? null,
      state: f.state ?? null,
      country: f.country ?? null,
    }));

  async function fillOriginFromCoords(lat: number, lon: number) {
    setLocating(true);
    try {
      const r = await reverseGeocodeFn({ data: { lat, lon } });
      setOrigin(r.label);
      setOriginPlace({ label: r.label, lat, lon, city: null, state: null, country: null });
    } catch {
      const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      setOrigin(fallback);
      setOriginPlace({ label: fallback, lat, lon, city: null, state: null, country: null });
    } finally {
      setLocating(false);
      setPendingAutoAnalyze(true);
    }
  }


  async function useCurrentLocation() {
    if (geo.status === "granted" && geo.coords) {
      await fillOriginFromCoords(geo.coords.lat, geo.coords.lon);
      return;
    }
    // Trigger the permission prompt; auto-fill once coords arrive (effect below).
    setAwaitingCoords(true);
    geo.request();
  }

  // Auto-fill the Origin once permission is granted from a pending request.
  useEffect(() => {
    if (!awaitingCoords) return;
    if (geo.status === "granted" && geo.coords) {
      setAwaitingCoords(false);
      void fillOriginFromCoords(geo.coords.lat, geo.coords.lon);
    } else if (geo.status === "denied" || geo.status === "unavailable" || geo.status === "error") {
      setAwaitingCoords(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingCoords, geo.status, geo.coords?.lat, geo.coords?.lon]);
  // Auto-run Route Analysis once the Origin has been filled from GPS, so the
  // driver gets a fresh Safety Score without a second click.
  useEffect(() => {
    if (!pendingAutoAnalyze) return;
    if (origin.trim().length < 2 || destination.trim().length < 2) return;
    setPendingAutoAnalyze(false);
    analysis.mutate({
      origin, destination, truck, trailer, truckProfile,
      ...(originPlace ? { originCoords: { lat: originPlace.lat, lon: originPlace.lon } } : {}),
      ...(destPlace ? { destinationCoords: { lat: destPlace.lat, lon: destPlace.lon } } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoAnalyze, origin, destination]);




  const analysis = useMutation({
    mutationFn: (vars: {
      origin: string; destination: string; truck: string; trailer: string;
      originCoords?: { lat: number; lon: number };
      destinationCoords?: { lat: number; lon: number };
      truckProfile?: typeof truckProfile;
    }) => analyzeFn({ data: vars }),
    onMutate: () => {
      setAnalyzedRouteKey(null);
      clearActiveRoute();
      queryClient.removeQueries({ queryKey: ["fuel-stops"] });
      queryClient.removeQueries({ queryKey: ["parking-stops"] });
      queryClient.removeQueries({ queryKey: ["truck-stops"] });
      queryClient.removeQueries({ queryKey: ["weigh-stations"] });

    },
    onSuccess: (data, vars) => {
      if (data.geometry.length >= 2) {
        saveActiveRoute({ origin: vars.origin, destination: vars.destination, geometry: data.geometry });
        setAnalyzedRouteKey(routeInputKey(vars.origin, vars.destination, vars.originCoords ?? null, vars.destinationCoords ?? null));
      } else {
        clearActiveRoute();
        setAnalyzedRouteKey(null);
      }
    },
  });

  const startNav = useMutation({
    mutationFn: async () => {
      const result = analysis.data;
      if (!result) throw new Error("Analyze a route first.");
      // Prefer live GPS as origin; fall back to analyzed origin coords.
      let originLat = result.origin.lat;
      let originLon = result.origin.lon;
      let originLabel = result.origin.name;
      if (geo.status === "granted" && geo.coords) {
        originLat = geo.coords.lat;
        originLon = geo.coords.lon;
        originLabel = "Current location";
      } else if (geo.status === "idle" || geo.status === "denied") {
        // Try once — non-blocking if denied.
        geo.request();
      }
      const route = await truckRouteFn({
        data: {
          originLat,
          originLon,
          destLat: result.destination.lat,
          destLon: result.destination.lon,
          truck: true,
        },
      });
      startNavigation({
        origin: { lat: originLat, lon: originLon, label: originLabel },
        destination: { lat: result.destination.lat, lon: result.destination.lon, label: result.destination.name },
        geometry: route.geometry,
        instructions: route.instructions,
        totalKm: route.distanceKm,
        baseDurationMin: route.durationMin,
        trafficDurationMin: route.durationTrafficMin,
        truck: true,
      });
      saveActiveRoute({
        origin: originLabel,
        destination: result.destination.name,
        geometry: route.geometry,
      });
      return route;
    },
    onSuccess: () => {
      router.navigate({ to: "/hazard-map" });
    },
  });



  const navToPoi = useMutation({
    mutationFn: async (p: PoiItem) => {
      let originLat: number | undefined;
      let originLon: number | undefined;
      let originLabel = "Current location";
      if (geo.status === "granted" && geo.coords) {
        originLat = geo.coords.lat;
        originLon = geo.coords.lon;
      } else if (analysis.data?.origin) {
        originLat = analysis.data.origin.lat;
        originLon = analysis.data.origin.lon;
        originLabel = analysis.data.origin.name;
      } else if (originPlace) {
        originLat = originPlace.lat;
        originLon = originPlace.lon;
        originLabel = originPlace.label;
      } else {
        geo.request();
        throw new Error("Enable GPS or set an Origin to navigate.");
      }
      const destinationLabel = [p.name, [p.city, p.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
      const routeAnalysis = await analyzeFn({
        data: {
          origin: originLabel,
          destination: destinationLabel,
          truck,
          trailer,
          truckProfile,
          originCoords: { lat: originLat, lon: originLon },
          destinationCoords: { lat: p.lat, lon: p.lon },
        },
      });
      if (routeAnalysis.geometry.length < 2) {
        throw new Error(routeAnalysis.routeMessage ?? "Route could not be calculated. Please check the address or try another destination.");
      }
      saveActiveRoute({ origin: originLabel, destination: destinationLabel, geometry: routeAnalysis.geometry });
      const route = await truckRouteFn({
        data: { originLat, originLon, destLat: p.lat, destLon: p.lon, truck: true },
      });
      startNavigation({
        origin: { lat: originLat, lon: originLon, label: originLabel },
        destination: { lat: p.lat, lon: p.lon, label: destinationLabel },
        geometry: route.geometry,
        instructions: route.instructions,
        totalKm: route.distanceKm,
        baseDurationMin: route.durationMin,
        trafficDurationMin: route.durationTrafficMin,
        truck: true,
      });
      saveActiveRoute({ origin: originLabel, destination: destinationLabel, geometry: route.geometry });
      return route;
    },
    onMutate: (p) => {
      const destinationLabel = [p.name, [p.city, p.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
      setDestination(destinationLabel);
      setDestPlace({ label: destinationLabel, lat: p.lat, lon: p.lon, city: p.city ?? null, state: p.state ?? null, country: null });
      clearActiveRoute();
      queryClient.removeQueries({ queryKey: ["fuel-stops"] });
      queryClient.removeQueries({ queryKey: ["parking-stops"] });
      queryClient.removeQueries({ queryKey: ["truck-stops"] });
      queryClient.removeQueries({ queryKey: ["weigh-stations"] });
    },
    onSuccess: () => router.navigate({ to: "/hazard-map" }),
  });



  // Live safety feed scoped to the active route corridor (NWS + DOT).
  const result = analysis.isPending ? undefined : analysis.data;
  const routeUnavailable = result?.routeStatus === "unavailable";
  const currentRouteKey = routeInputKey(
    origin,
    destination,
    originPlace ? { lat: originPlace.lat, lon: originPlace.lon } : null,
    destPlace ? { lat: destPlace.lat, lon: destPlace.lon } : null,
  );
  const routeMatchesCurrentInputs = !!result && analyzedRouteKey === currentRouteKey;
  const activeRouteForQueries = analysis.isPending || routeUnavailable || !routeMatchesCurrentInputs ? null : activeRoute;
  const geometry = routeUnavailable || !routeMatchesCurrentInputs ? [] : (result?.geometry ?? activeRouteForQueries?.geometry ?? []);
  const routeLabel = result
    ? `${origin || result.origin.name} → ${destination || result.destination.name}`
    : activeRouteForQueries
      ? `${activeRouteForQueries.origin} → ${activeRouteForQueries.destination}`
      : "No active route";
  const routeKey = routeSignature(geometry);
  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ["safety-feed", routeKey],
    queryFn: () => feedFn({ data: { geometry } }),
    enabled: geometry.length >= 2,
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

  // Truck-friendly fuel + parking POIs along the active route (TomTom).
  const poiGeometry = sampleRouteGeometry(geometry, 1000);
  const { data: fuelStops, isLoading: fuelLoading } = useQuery({
    queryKey: ["fuel-stops", routeKey],
    queryFn: () => searchPoisFn({ data: { geometry: poiGeometry, kind: "fuel", limit: 100 } }),
    enabled: geometry.length >= 2,
    staleTime: 0,
  });
  const { data: parkingStops, isLoading: parkingLoading } = useQuery({
    queryKey: ["parking-stops", routeKey],
    queryFn: () => searchPoisFn({ data: { geometry: poiGeometry, kind: "parking", limit: 100 } }),
    enabled: geometry.length >= 2,
    staleTime: 0,
  });
  const { data: truckStops, isLoading: truckStopsLoading } = useQuery({
    queryKey: ["truck-stops", routeKey],
    queryFn: () => searchPoisFn({ data: { geometry: poiGeometry, kind: "truck_stop", limit: 100 } }),
    enabled: geometry.length >= 2,
    staleTime: 0,
  });
  const { data: weighStations, isLoading: weighLoading } = useQuery({
    queryKey: ["weigh-stations", routeKey],
    queryFn: () => searchPoisFn({ data: { geometry: poiGeometry, kind: "weigh_station", limit: 100 } }),
    enabled: geometry.length >= 2,
    staleTime: 0,
  });


  // Stat cards: prefer the analyzed route when present, else fall back to the
  // live national feed. This keeps Wind/Weather Risk specific to the path.
  const routeRisks = result?.risks ?? [];
  const feedWeatherAlerts = feed?.weatherAlerts ?? [];
  const feedRoadAlerts = feed?.roadAlerts ?? [];
  const usingRoute = !!result && !routeUnavailable && routeMatchesCurrentInputs;
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
  const totalPenalty = breakdown ? breakdown.weather + breakdown.wind + breakdown.closure + breakdown.hazard : 0;

  function onAnalyze(e: React.FormEvent) {
    e.preventDefault();
    analysis.mutate({
      origin, destination, truck, trailer, truckProfile,
      ...(originPlace ? { originCoords: { lat: originPlace.lat, lon: originPlace.lon } } : {}),
      ...(destPlace ? { destinationCoords: { lat: destPlace.lat, lon: destPlace.lon } } : {}),
    });
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
              <div className="flex items-center justify-between gap-2">
                <Label>Origin</Label>
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  disabled={locating || geo.status === "prompting"}
                  className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60"
                >
                  <LocateFixed className="size-3" />
                  {locating || geo.status === "prompting"
                    ? "Locating…"
                    : geo.status === "granted"
                      ? "Use my current location"
                      : "Use my current location"}
                </button>
              </div>
              <AddressAutocomplete
                required
                value={origin}
                onChange={(t) => { setOrigin(t); if (originPlace && t !== originPlace.label) setOriginPlace(null); }}
                onSelect={(p) => setOriginPlace(p)}
                placeholder="Denver, CO"
                proximity={geo.coords ?? null}
                favorites={favSuggestions}
              />
              {geo.status === "denied" && (
                <p className="text-[11px] text-destructive">Location access is needed for live route safety alerts.</p>
              )}
              {geo.status === "unavailable" && (
                <p className="text-[11px] text-muted-foreground">Geolocation not supported in this browser.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Destination</Label>
              <AddressAutocomplete
                required
                value={destination}
                onChange={(t) => { setDestination(t); if (destPlace && t !== destPlace.label) setDestPlace(null); }}
                onSelect={(p) => setDestPlace(p)}
                placeholder="Salt Lake City, UT"
                proximity={originPlace ? { lat: originPlace.lat, lon: originPlace.lon } : (geo.coords ?? null)}
                favorites={favSuggestions}
              />
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
              {(analysis.error as Error).message || "Route could not be calculated. Please check the address or try another destination."}
            </div>
          )}
          {routeUnavailable && (
            <div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">
              {result?.routeMessage ?? "Route could not be calculated. Please check the address or try another destination."}
            </div>
          )}
          {result?.routeMessage && !routeUnavailable && (
            <div className="text-sm text-warning border border-warning/40 bg-warning/10 rounded-md p-3">
              {result.routeMessage}
            </div>
          )}
          {result && !routeUnavailable && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span><MapPin className="inline size-3.5 mr-1" />{Math.round(result.distanceKm * 0.621371)} mi</span>
                <span>~{formatDriveTime(result.durationMin)} <span className="text-xs">(Drive time estimate)</span></span>
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
                  Weather forecast not connected. NWS severe weather alerts connected.
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Weather shown for the start, midpoint, and destination of your route.
              </p>
              <div className="grid sm:grid-cols-3 gap-2">
                {result.weather.map((w) => {
                  const tempF = w.tempC != null ? Math.round((w.tempC * 9) / 5 + 32) : null;
                  const windMph = w.windKph != null ? Math.round(w.windKph * 0.621371) : null;
                  const gustMph = w.gustKph != null ? Math.round(w.gustKph * 0.621371) : null;
                  const precipIn = w.precipMm != null ? Math.round(w.precipMm * 0.03937 * 100) / 100 : null;
                  const risk = weatherRiskNote(tempF, windMph, gustMph, precipIn, w.visibilityKm, w.condition);
                  return (
                    <div key={w.label} className="rounded-md border border-border bg-background p-3 text-xs space-y-1">
                      <div className="font-medium text-sm text-foreground">{w.label}</div>
                      {w.available ? (
                        <>
                          <div className="text-muted-foreground">{w.condition}</div>
                          <div className="flex items-center gap-2"><Thermometer className="size-3" />{tempF != null ? `${tempF}°F` : "—"}</div>
                          <div className="flex items-center gap-2"><Wind className="size-3" />Wind {windMph != null ? `${windMph} mph` : "—"}{gustMph != null && ` · gust ${gustMph} mph`}</div>
                          <div className="flex items-center gap-2"><CloudRain className="size-3" />Precip {precipIn != null ? `${precipIn} in` : "—"}</div>
                          <div className={cn("pt-1 text-[11px]", risk.tone)}>{risk.note}</div>
                        </>
                      ) : (
                        <div className="text-muted-foreground">Weather forecast not connected. NWS severe weather alerts connected.</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {result.weatherAlerts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Active alerts on this route ({result.weatherAlerts.length} total, grouped by type & region)
                  </div>
                  {groupAlerts(result.weatherAlerts).map((g) => (
                    <div key={g.key} className="rounded-md border border-border bg-background p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(g.severity)}`}>{g.severity}</span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="font-semibold leading-tight">{g.event}</div>
                          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] text-muted-foreground">
                            <div><span className="text-foreground/70 font-medium">Region:</span> {g.region}</div>
                            <div><span className="text-foreground/70 font-medium">Source:</span> {g.provider}</div>
                            <div><span className="text-foreground/70 font-medium">Effective:</span> {new Date(g.effective).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                            <div><span className="text-foreground/70 font-medium">Count:</span> {g.count} {g.count === 1 ? "area" : "areas"}</div>
                          </div>
                          <div className="text-[12px] pt-1"><span className="text-foreground/70 font-medium">Action:</span> {g.recommendedAction}</div>
                        </div>
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
                      <span className="flex-1">{r.message} <span className="text-destructive">−{r.penalty}</span></span>
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

              {/* Truck restriction risk — honest "not connected" notice with profile context. */}
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm space-y-2">
                <div className="font-medium text-warning inline-flex items-center gap-1.5">
                  <ShieldAlert className="size-3.5" /> Truck Restriction Risk
                </div>
                <p className="text-foreground/90">{result.truckRestrictions.message}</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-5">
                  <li>Low clearance risk — not verified</li>
                  <li>Weight restriction risk — not verified</li>
                  <li>Hazmat restriction risk — not verified{result.truckRestrictions.profile?.hazmat ? " (hazmat load on profile)" : ""}</li>
                </ul>
                {result.truckRestrictions.profile && (
                  <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                    <span className="font-medium text-foreground/70">Using profile:</span>{" "}
                    {[
                      result.truckRestrictions.profile.heightIn != null ? `${result.truckRestrictions.profile.heightIn}" tall` : null,
                      result.truckRestrictions.profile.weightLbs != null ? `${result.truckRestrictions.profile.weightLbs.toLocaleString()} lbs` : null,
                      result.truckRestrictions.profile.lengthFt != null ? `${result.truckRestrictions.profile.lengthFt}' long` : null,
                      result.truckRestrictions.profile.axles != null ? `${result.truckRestrictions.profile.axles} axles` : null,
                      result.truckRestrictions.profile.hazmat ? "hazmat" : null,
                      result.truckRestrictions.profile.loaded === true ? "loaded" : result.truckRestrictions.profile.loaded === false ? "empty" : null,
                    ].filter(Boolean).join(" · ") || "no dimensions saved — set in Profile › Truck Profile"}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center pt-1">
                {navSession ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.navigate({ to: "/hazard-map" })}
                    >
                      <Navigation2 className="size-4 mr-1" /> Open navigation
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => { stopNavigation(); clearActiveRoute(); }}>
                      End navigation
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    onClick={() => startNav.mutate()}
                    disabled={startNav.isPending}
                  >
                    {startNav.isPending ? (
                      <><Loader2 className="size-4 mr-1 animate-spin" /> Starting…</>
                    ) : (
                      <><Navigation2 className="size-4 mr-1" /> Start Navigation</>
                    )}
                  </Button>
                )}
                {geo.status === "denied" && (
                  <span className="text-[11px] text-destructive">Location access is needed for live route safety alerts.</span>
                )}
                {geo.status !== "granted" && geo.status !== "denied" && (
                  <span className="text-[11px] text-muted-foreground">Enable GPS for turn-by-turn from your current position.</span>
                )}
              </div>
              {startNav.isError && (
                <div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">
                  {(startNav.error as Error).message || "Failed to start navigation."}
                </div>
              )}

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
                <p>Start at <strong>100</strong>. Only subtract penalties for actual route conditions found in live data.</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li><strong>Minor weather</strong>: light/moderate rain, reduced visibility, snow, thunderstorms, or extreme temperatures add 0–10 each, capped at 25.</li>
                  <li><strong>Severe weather alerts</strong>: only medium or stronger active route alerts add 5–25. Low/normal alert counts add 0.</li>
                  <li><strong>High winds</strong>: only elevated wind or gust thresholds add 8–30, capped at 30.</li>
                  <li><strong>Road closures</strong>: only connected DOT incidents add 10–30. No DOT data adds 0.</li>
                  <li><strong>Driver hazards</strong>: verified driver reports add 5–20. Zero reports add 0.</li>
                </ul>
                <p>Score = 100 − (weather + wind + closures + verified hazards). Clear/partly cloudy, low-wind routes remain high-scoring.</p>
              </PopoverContent>
            </Popover>
          </div>
          <div className={`mt-3 text-6xl font-bold ${score == null ? "text-muted-foreground" : score >= 85 ? "text-success" : score >= 70 ? "text-warning" : "text-destructive"}`}>
            {analysis.isPending ? <Loader2 className="size-12 animate-spin mx-auto" /> : (score ?? "—")}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {routeUnavailable ? result?.routeMessage : score == null ? "Analyze a route to see your score." : result?.recommendedAction}
          </p>
          {score != null && result?.riskLevel && (
            <div className="mt-3 rounded-md border border-border bg-background p-3 text-left">
              <div className="text-xs font-semibold">{result.riskLevel}</div>
              <p className="mt-1 text-xs text-muted-foreground">{result.scoreExplanation}</p>
            </div>
          )}
          {breakdown && score != null && (
            <div className="mt-4 pt-4 border-t border-border text-left space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Breakdown (penalties)</div>
              <BreakdownRow label="Weather" value={breakdown.weather} source="Open-Meteo + NWS" />
              <BreakdownRow label="Wind" value={breakdown.wind} source="Open-Meteo + NWS" />
              <BreakdownRow label="Road closures" value={breakdown.closure} source={result?.providers.road ?? "not connected"} />
              <BreakdownRow label="Driver reports" value={breakdown.hazard} source="Community" />
              <div className="flex justify-between text-xs pt-1.5 mt-1.5 border-t border-border">
                <span className="font-medium">100 − {totalPenalty} =</span>
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
          <StatCard icon={<Construction className="size-5" />} label="Road Closure Risk" count={closureCount} sub={feed?.providers.road === "not_connected" ? "Connect DOT API" : usingRoute ? "Closures on this route" : "Active closures"} accent="destructive" loading={feedLoading} />
          <StatCard icon={<ShieldAlert className="size-5" />} label="Truck Restriction Risk" count={0} sub="Bridge / weight / hazmat data not connected yet" accent="warning" />
          <StatCard icon={<Fuel className="size-5" />} label="Fuel Stations (optional)" count={usingRoute ? fuelStops?.totalFound ?? 0 : 0} sub={fuelStops && !fuelStops.connected ? "Not connected yet" : usingRoute ? `Route-filtered, deduplicated · ${fuelStops?.provider ?? "TomTom"}` : "Analyze a route to find stops"} accent="primary" loading={fuelLoading} onClick={usingRoute && (fuelStops?.totalFound ?? 0) > 0 ? () => setPoiDialog({ title: "Fuel Stations on this Route", result: fuelStops ?? null }) : undefined} />
          <StatCard icon={<ParkingCircle className="size-5" />} label="Parking Options" count={usingRoute ? parkingStops?.totalFound ?? 0 : 0} sub={parkingStops && !parkingStops.connected ? "Not connected yet" : usingRoute ? "Truck stops, rest areas, travel centers · route-filtered" : "Analyze a route to find parking"} accent="primary" loading={parkingLoading} onClick={usingRoute && (parkingStops?.totalFound ?? 0) > 0 ? () => setPoiDialog({ title: "Truck Parking on this Route", result: parkingStops ?? null }) : undefined} />
          <StatCard icon={<Truck className="size-5" />} label="Truck Stops" count={usingRoute ? truckStops?.totalFound ?? 0 : 0} sub={truckStops && !truckStops.connected ? "Not connected yet" : usingRoute ? "Pilot · Flying J · Love's · TA · Petro · verified plazas" : "Analyze a route to find truck stops"} accent="primary" loading={truckStopsLoading} onClick={usingRoute && (truckStops?.totalFound ?? 0) > 0 ? () => setPoiDialog({ title: "Truck Stops on this Route", result: truckStops ?? null }) : undefined} />
          <StatCard icon={<Scale className="size-5" />} label="Weigh Stations" count={usingRoute ? weighStations?.totalFound ?? 0 : 0} sub={weighStations && !weighStations.connected ? "Not connected yet" : usingRoute ? `Route-filtered, deduplicated · ${weighStations?.provider ?? "TomTom"}` : "Analyze a route to find weigh stations"} accent="warning" loading={weighLoading} onClick={usingRoute && (weighStations?.totalFound ?? 0) > 0 ? () => setPoiDialog({ title: "Weigh Stations on this Route", result: weighStations ?? null }) : undefined} />
          <StatCard icon={<Users className="size-5" />} label="Driver Reports" count={driverCount} sub="Community layer · live" accent="warning" />
        </div>
      </div>

      {usingRoute && (
        <div className="grid lg:grid-cols-2 gap-4">
          <PoiList
            icon={<Fuel className="size-4 text-primary" />}
            title="Fuel Stops on this Route"
            routeLabel={routeLabel}
            loading={fuelLoading}
            result={fuelStops}
            emptyHint="No truck-friendly fuel stops detected near this route."
          />
          <PoiList
            icon={<ParkingCircle className="size-4 text-primary" />}
            title="Truck Parking on this Route"
            routeLabel={routeLabel}
            loading={parkingLoading}
            result={parkingStops}
            emptyHint="No truck stops, rest areas, or parking detected near this route."
          />
          <PoiList
            icon={<Truck className="size-4 text-primary" />}
            title="Truck Stops on this Route"
            routeLabel={routeLabel}
            loading={truckStopsLoading}
            result={truckStops}
            emptyHint="No truck stops detected near this route."
          />
          <PoiList
            icon={<Scale className="size-4 text-primary" />}
            title="Weigh Stations on this Route"
            routeLabel={routeLabel}
            loading={weighLoading}
            result={weighStations}
            emptyHint="No weigh stations detected near this route."
          />
        </div>
      )}


      <div>
        <h2 className="font-semibold mb-3">Recent live alerts (grouped by type & region)</h2>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {feedLoading && <div className="p-6 text-sm text-muted-foreground">Loading live alerts…</div>}
          {!feedLoading && feedWeatherAlerts.length === 0 && feedRoadAlerts.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground inline-flex items-center gap-2">
              <AlertTriangle className="size-4" /> No active weather or road alerts from connected sources.
            </div>
          )}
          {groupAlerts(feedWeatherAlerts).slice(0, 6).map((g) => (
            <div key={g.key} className="p-4 flex items-start gap-3">
              <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(g.severity)}`}>{g.severity}</span>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="font-semibold text-sm">{g.event}</div>
                <div className="text-[12px] text-muted-foreground">
                  <span className="text-foreground/70 font-medium">Region:</span> {g.region} · <span className="text-foreground/70 font-medium">Effective:</span> {new Date(g.effective).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {g.count} {g.count === 1 ? "area" : "areas"}
                </div>
                <div className="text-[12px]"><span className="text-foreground/70 font-medium">Action:</span> {g.recommendedAction}</div>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap px-2 py-0.5 rounded border border-border self-start">Weather · {g.provider}</span>
            </div>
          ))}
        </div>
      </div>

      <PoiDialog
        open={!!poiDialog}
        onOpenChange={(v) => { if (!v) setPoiDialog(null); }}
        title={poiDialog?.title ?? ""}
        result={poiDialog?.result ?? null}
        onShowOnMap={(p) => {
          const region = [p.city, p.state].filter(Boolean).join(", ");
          const details = [region || p.address, typeLabelShort(p.type), p.distanceMi != null ? `${p.distanceMi < 1 ? "<1" : Math.round(p.distanceMi)} mi from route` : null].filter(Boolean).join(" · ");
          router.navigate({
            to: "/hazard-map",
            search: { focusLat: p.lat, focusLon: p.lon, focusLabel: p.name, focusDetails: details },
          } as never);
          setPoiDialog(null);
        }}
        onNavigate={(p) => {
          navToPoi.mutate(p);
          setPoiDialog(null);
        }}
        navigating={navToPoi.isPending}
      />

      {navToPoi.isError && (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">
          {(navToPoi.error as Error).message || "Route could not be calculated. Please check the address or try another destination."}
        </div>
      )}

    </div>
  );
}

type PoiDialogResult = NonNullable<Awaited<ReturnType<typeof searchTruckPois>>>;
type PoiItem = PoiDialogResult["pois"][number];

function typeLabelShort(t?: string) {
  return t === "truck_stop" ? "Truck stop"
    : t === "rest_area" ? "Rest area"
    : t === "parking" ? "Parking"
    : t === "fuel" ? "Fuel"
    : t === "weigh_station" ? "Weigh station"
    : "POI";
}

function PoiDialog({
  open, onOpenChange, title, result, onShowOnMap, onNavigate, navigating,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  result: PoiDialogResult | null;
  onShowOnMap: (p: PoiItem) => void;
  onNavigate: (p: PoiItem) => void;
  navigating?: boolean;
}) {
  const pois = result?.pois ?? [];
  const debug = result?.debug;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {pois.length} location{pois.length === 1 ? "" : "s"} along your route · Source: {result?.provider ?? "TomTom"}
          </DialogDescription>
        </DialogHeader>
        {debug && (
          <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground space-y-0.5">
            <div className="font-medium text-foreground/70">Debug · count source</div>
            <div>Raw TomTom results: <span className="font-mono">{debug.rawResultsCount}</span></div>
            <div>Route-filtered results: <span className="font-mono">{debug.routeFilteredResultsCount ?? debug.filteredResultsCount}</span> (excluded {debug.filteredOutCount})</div>
            <div>Deduplicated results: <span className="font-mono">{debug.deduplicatedResultsCount ?? result?.totalFound ?? 0}</span></div>
            <div>Final displayed count: <span className="font-mono">{debug.finalDisplayedCount ?? pois.length}</span> · Corridor: {debug.corridorRadiusMi} mi · Search points: {debug.searchPointCount}</div>
          </div>
        )}
        {pois.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No locations found.</div>
        ) : (
          <ul className="divide-y divide-border max-h-[60vh] overflow-auto -mx-2 px-2">
            {pois.map((p) => {
              const region = [p.city, p.state].filter(Boolean).join(", ");
              return (
                <li key={p.id} className="py-3 flex items-start gap-3">
                  <MapPin className="size-4 mt-1 text-primary shrink-0" />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="font-medium truncate">{p.name}{p.brand && p.brand !== p.name ? ` · ${p.brand}` : ""}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {region || p.address || "Location"}
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 flex flex-wrap items-center gap-x-2">
                      <span className="uppercase tracking-wider">{typeLabelShort(p.type)}</span>
                      {p.distanceMi != null && (
                        <span>· {p.distanceMi < 1 ? "<1 mi" : `${Math.round(p.distanceMi)} mi`} from route</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => onShowOnMap(p)}>
                      <MapPin className="size-3.5" /> Show on Map
                    </Button>
                    <Button size="sm" onClick={() => onNavigate(p)} disabled={navigating}>
                      {navigating ? <Loader2 className="size-3.5 animate-spin" /> : <Navigation2 className="size-3.5" />} Navigate
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, count, sub, accent, loading, onClick }: { icon: React.ReactNode; label: string; count: number; sub?: string; accent: "primary" | "destructive" | "warning"; loading?: boolean; onClick?: () => void }) {
  const colors = {
    primary: "text-primary bg-primary/10 border-primary/20",
    destructive: "text-destructive bg-destructive/10 border-destructive/20",
    warning: "text-warning bg-warning/10 border-warning/20",
  }[accent];
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      className={cn(
        "rounded-xl border border-border bg-card p-5",
        clickable && "cursor-pointer hover:border-primary/50 hover:bg-card/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      <div className={`size-10 rounded-md flex items-center justify-center border ${colors}`}>{icon}</div>
      <div className="mt-4 text-3xl font-semibold">{loading ? <Loader2 className="size-7 animate-spin" /> : count}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</div>}
      {clickable && <div className="text-[10px] text-primary/80 mt-1">View locations →</div>}
    </div>
  );
}

function PoiList({
  icon, title, routeLabel, loading, result, emptyHint,
}: {
  icon: React.ReactNode;
  title: string;
  routeLabel: string;
  loading: boolean;
  result:
    | {
        connected: boolean;
        provider: string;
        message?: string;
        totalFound?: number;
        debug?: {
          routeUsed: string;
          routePointCount: number;
          searchPointCount: number;
          corridorRadiusMi: number;
          rawResultsCount: number;
          filteredResultsCount: number;
          filteredOutCount: number;
          searchingFullRoute: boolean;
        };
        pois: Array<{
          id: string;
          name: string;
          brand: string | null;
          address: string;
          city?: string | null;
          state?: string | null;
          type?: string;
          distanceMi?: number | null;
          source?: string;
        }>;
      }
    | undefined;
  emptyHint: string;
}) {
  const typeLabel = (t?: string) =>
    t === "truck_stop" ? "Truck stop"
    : t === "rest_area" ? "Rest area"
    : t === "parking" ? "Parking"
    : t === "fuel" ? "Fuel"
    : t === "weigh_station" ? "Weigh station"
    : "";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">{icon}<h3 className="font-semibold">{title}</h3></div>
      <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground space-y-1">
        <div><span className="font-medium text-foreground/70">Route used:</span> {routeLabel}</div>
        {result?.debug?.routeUsed && (
          <div><span className="font-medium text-foreground/70">Polyline:</span> {result.debug.routeUsed}</div>
        )}
        <div>
          <span className="font-medium text-foreground/70">Search points:</span> {result?.debug?.searchPointCount ?? 0}
          {" · "}<span className="font-medium text-foreground/70">Raw:</span> {result?.debug?.rawResultsCount ?? 0}
          {" · "}<span className="font-medium text-foreground/70">Filtered:</span> {result?.debug?.filteredResultsCount ?? result?.totalFound ?? 0}
          {" · "}<span className="font-medium text-foreground/70">Corridor:</span> {result?.debug?.corridorRadiusMi ?? 20} mi
        </div>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Searching along route…</div>
      ) : !result ? (
        <div className="text-sm text-muted-foreground">Analyze a route to find stops.</div>
      ) : !result.connected ? (
        <div className="text-sm text-muted-foreground border border-border bg-muted/30 rounded-md p-3">
          {result.message ?? "Not connected yet."}
        </div>
      ) : result.pois.length === 0 ? (
        <div className="text-sm text-muted-foreground">{emptyHint}</div>
      ) : (
        <>
          {result.message && (
            <div className="text-[11px] text-muted-foreground border border-border bg-muted/30 rounded-md p-2">
              {result.message}
            </div>
          )}
          <ul className="divide-y divide-border max-h-80 overflow-auto">
            {result.pois.slice(0, 20).map((p) => {
              const region = [p.city, p.state].filter(Boolean).join(", ");
              return (
                <li key={p.id} className="py-2 flex items-start gap-3 text-sm">
                  <MapPin className="size-3.5 mt-1 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}{p.brand && p.brand !== p.name ? ` · ${p.brand}` : ""}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {region || p.address}
                      {p.type && <> · <span className="uppercase tracking-wider">{typeLabel(p.type)}</span></>}
                      {p.source && <> · Source: {p.source}</>}
                    </div>
                  </div>
                  {p.distanceMi != null && (
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{p.distanceMi < 1 ? "<1 mi" : `${Math.round(p.distanceMi)} mi from route`}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {result?.connected && (
        <div className="text-[10px] text-muted-foreground/80">Source: {result.provider}</div>
      )}
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

type AlertLike = {
  id: string;
  event: string;
  severity: "low" | "medium" | "high" | "critical";
  areaDesc: string;
  recommendedAction: string;
  effective: string;
  provider: string;
};

type GroupedAlert = {
  key: string;
  event: string;
  severity: "low" | "medium" | "high" | "critical";
  region: string;
  count: number;
  effective: string;
  provider: string;
  recommendedAction: string;
};

function summarizeRegion(areaDescs: string[]): { region: string; count: number } {
  const states = new Set<string>();
  let count = 0;
  for (const desc of areaDescs) {
    const parts = desc.split(";").map((s) => s.trim()).filter(Boolean);
    count += parts.length || 1;
    for (const p of parts) {
      const m = p.match(/\b([A-Z]{2})\b\s*$/);
      if (m) states.add(m[1]);
    }
  }
  const region = states.size > 0
    ? [...states].sort().join(", ")
    : count > 0 ? `${count} area${count === 1 ? "" : "s"} along route` : "Region unavailable";
  return { region, count };
}

function groupAlerts(alerts: AlertLike[]): GroupedAlert[] {
  const sevRank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
  const map = new Map<string, AlertLike[]>();
  for (const a of alerts) {
    const list = map.get(a.event) ?? [];
    list.push(a);
    map.set(a.event, list);
  }
  const groups: GroupedAlert[] = [];
  for (const [event, list] of map) {
    const top = [...list].sort((x, y) => sevRank[y.severity] - sevRank[x.severity])[0];
    const { region, count } = summarizeRegion(list.map((a) => a.areaDesc));
    const earliest = list.reduce((min, a) => (a.effective < min ? a.effective : min), top.effective);
    groups.push({
      key: event,
      event,
      severity: top.severity,
      region,
      count,
      effective: earliest,
      provider: top.provider,
      recommendedAction: top.recommendedAction,
    });
  }
  return groups.sort((a, b) => sevRank[b.severity] - sevRank[a.severity]);
}

function formatDriveTime(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function weatherRiskNote(
  tempF: number | null,
  windMph: number | null,
  gustMph: number | null,
  precipIn: number | null,
  visibilityKm: number | null,
  condition: string,
): { note: string; tone: string } {
  const c = (condition ?? "").toLowerCase();
  if (c.includes("thunder") || c.includes("tornado")) return { note: "Severe weather — use caution.", tone: "text-destructive" };
  if (gustMph != null && gustMph >= 45) return { note: "High wind gusts — risk for high-profile vehicles.", tone: "text-destructive" };
  if (windMph != null && windMph >= 30) return { note: "Strong sustained wind.", tone: "text-warning" };
  if (visibilityKm != null && visibilityKm < 1.5) return { note: "Low visibility — slow down.", tone: "text-warning" };
  if (precipIn != null && precipIn >= 0.2) return { note: "Heavy precipitation — wet roads.", tone: "text-warning" };
  if (c.includes("snow") || c.includes("ice")) return { note: "Winter conditions possible.", tone: "text-warning" };
  if (tempF != null && tempF <= 20) return { note: "Freezing temps — watch for ice.", tone: "text-warning" };
  if (tempF != null && tempF >= 100) return { note: "Extreme heat — check tires & cooling.", tone: "text-warning" };
  return { note: "No major weather risk.", tone: "text-success" };
}
