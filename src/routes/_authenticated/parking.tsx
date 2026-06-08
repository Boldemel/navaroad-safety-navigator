import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { findNearbyTruckStops, type NearbyPoi } from "@/lib/nearby-poi.functions";
import { Button } from "@/components/ui/button";
import { ParkingCircle, Loader2, Truck, MapPin, Navigation, Bed, Droplets, ShowerHead, Scale, Fuel, Phone, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useHos, fmtHm } from "@/hooks/use-hos";

export const Route = createFileRoute("/_authenticated/parking")({
  component: ParkingPage,
});

type Kind = "all" | "truck_stop" | "rest_area" | "parking";

function ParkingPage() {
  const find = useServerFn(findNearbyTruckStops);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [radius, setRadius] = useState(50);
  const hos = useHos();

  function locate() {
    if (!("geolocation" in navigator)) { setGeoError("Geolocation not available"); return; }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }
  useEffect(() => { locate(); }, []);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["nearby-pois", coords?.lat, coords?.lon, kind, radius],
    queryFn: () => find({ data: { lat: coords!.lat, lon: coords!.lon, kind, radiusMi: radius } }),
    enabled: !!coords,
    staleTime: 60_000,
  });

  const pois = data?.pois ?? [];
  const driveLeft = hos.remaining.drive;
  const findNowUrgent = driveLeft <= 60 && hos.state.status === "driving";

  return (
    <AppShell>
      <div className="container max-w-3xl py-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ParkingCircle className="size-6 text-primary" /> Truck Stops & Parking</h1>
          <p className="text-sm text-muted-foreground">Find rest areas, truck stops, and parking near you</p>
        </div>

        {findNowUrgent && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            Only {fmtHm(driveLeft)} of drive time left — find parking now.
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {([
              { k: "all", label: "All", icon: Truck },
              { k: "truck_stop", label: "Truck stops", icon: Fuel },
              { k: "rest_area", label: "Rest areas", icon: Bed },
              { k: "parking", label: "Parking only", icon: ParkingCircle },
            ] as const).map((o) => (
              <Button key={o.k} size="sm" variant={kind === o.k ? "default" : "outline"} onClick={() => setKind(o.k)}>
                <o.icon className="size-3.5 mr-1.5" /> {o.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Radius</span>
            <input type="range" min={10} max={150} step={5} value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10))} className="flex-1" />
            <span className="font-medium w-12 text-right">{radius} mi</span>
            <Button size="sm" variant="outline" onClick={() => { locate(); refetch(); }}>Refresh</Button>
          </div>
        </div>

        {geoError && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Location error: {geoError}. <Button variant="link" size="sm" onClick={locate}>Try again</Button>
          </div>
        )}

        {!coords ? (
          <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : isFetching ? (
          <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : !data?.connected ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {data?.message ?? "Search unavailable"}
          </div>
        ) : pois.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No truck stops or rest areas found within {radius} mi. Try increasing the radius.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{pois.length} results within {radius} mi</div>
            {pois.map((p) => <PoiRow key={p.id} poi={p} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PoiRow({ poi }: { poi: NearbyPoi }) {
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lon}&travelmode=driving`;
  const typeColor = poi.type === "truck_stop" ? "text-primary" : poi.type === "rest_area" ? "text-success" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex gap-3">
      <div className={cn("size-9 rounded-md border border-border flex items-center justify-center shrink-0", typeColor)}>
        {poi.type === "truck_stop" ? <Truck className="size-4" /> : poi.type === "rest_area" ? <Bed className="size-4" /> : <ParkingCircle className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{poi.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <MapPin className="size-3 shrink-0" />
              {[poi.address, poi.city, poi.state].filter(Boolean).join(", ") || "Address unavailable"}
            </div>
          </div>
          <div className="text-xs font-medium shrink-0">{poi.distanceMi} mi</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {poi.amenities.diesel && <span className="text-[10px] flex items-center gap-0.5 text-muted-foreground"><Droplets className="size-3" /> Diesel</span>}
          {poi.amenities.showers && <span className="text-[10px] flex items-center gap-0.5 text-muted-foreground"><ShowerHead className="size-3" /> Showers</span>}
          {poi.amenities.scales && <span className="text-[10px] flex items-center gap-0.5 text-muted-foreground"><Scale className="size-3" /> Scales</span>}
          {poi.amenities.parking && <span className="text-[10px] flex items-center gap-0.5 text-muted-foreground"><ParkingCircle className="size-3" /> Parking</span>}
          {poi.phone && <a href={`tel:${poi.phone}`} className="text-[10px] flex items-center gap-0.5 text-primary"><Phone className="size-3" /> {poi.phone}</a>}
          <a href={navUrl} target="_blank" rel="noreferrer" className="ml-auto">
            <Button size="sm" variant="outline" className="h-7"><Navigation className="size-3 mr-1" /> Navigate</Button>
          </a>
        </div>
      </div>
    </div>
  );
}
