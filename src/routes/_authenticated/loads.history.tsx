import { createFileRoute } from "@tanstack/react-router";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrips, deleteTrip, type TripLog } from "@/lib/trip-logs.functions";
import { Button } from "@/components/ui/button";
import { BookOpen, Download, Search, Trash2, Loader2, MapPin } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/loads/history")({
  component: TripsPage,
});

function toCsv(trips: TripLog[]) {
  const headers = ["Date", "Origin", "Destination", "Miles", "Duration (min)", "Truck", "Trailer", "Safety", "Hazards", "Weather alerts", "Fuel cost", "Notes"];
  const rows = trips.map((t) => [
    new Date(t.completed_at).toISOString(),
    t.origin, t.destination,
    t.distance_mi ?? "", t.duration_min ?? "",
    t.truck_type ?? "", t.trailer_type ?? "",
    t.safety_score ?? "", t.hazard_count ?? "", t.weather_alerts ?? "",
    t.fuel_cost ?? "", t.notes ?? "",
  ]);
  return [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function TripsPage() {
  const fetchTrips = useServerFn(listTrips);
  const removeTrip = useServerFn(deleteTrip);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["trips"], queryFn: () => fetchTrips() });
  const trips = data?.trips ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) =>
      t.origin.toLowerCase().includes(q) ||
      t.destination.toLowerCase().includes(q) ||
      (t.truck_type ?? "").toLowerCase().includes(q) ||
      (t.notes ?? "").toLowerCase().includes(q),
    );
  }, [trips, search]);

  const del = useMutation({
    mutationFn: (id: string) => removeTrip({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trips"] }); toast.success("Trip deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  function exportCsv() {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `navaroad-trips-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalMiles = filtered.reduce((s, t) => s + (t.distance_mi ?? 0), 0);
  const totalCost = filtered.reduce((s, t) => s + (t.fuel_cost ?? 0), 0);

  return (
      <div className="container max-w-4xl py-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="size-6 text-primary" /> Trip History</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} trips · {Math.round(totalMiles).toLocaleString()} mi · ${totalCost.toFixed(2)} fuel</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="size-4 mr-2" /> Export CSV
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by origin, destination, truck, notes…"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-sm"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {trips.length === 0 ? "No trips logged yet. Analyze a route on the dashboard and tap “Log this trip”." : "No trips match your search."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium flex items-center gap-1.5 truncate">
                      <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{t.origin}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="truncate">{t.destination}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(t.completed_at).toLocaleString()}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this trip?")) del.mutate(t.id); }} disabled={del.isPending}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {t.distance_mi != null && <span>{Math.round(t.distance_mi)} mi</span>}
                  {t.duration_min != null && <span>~{Math.floor(t.duration_min / 60)}h {Math.round(t.duration_min % 60)}m</span>}
                  {t.truck_type && <span>{t.truck_type}{t.trailer_type ? ` · ${t.trailer_type}` : ""}</span>}
                  {t.safety_score != null && <span>Safety {t.safety_score}/100</span>}
                  {t.hazard_count != null && <span>{t.hazard_count} hazards</span>}
                  {t.weather_alerts != null && <span>{t.weather_alerts} weather</span>}
                  {t.fuel_cost != null && <span>${t.fuel_cost.toFixed(2)} fuel</span>}
                </div>
                {t.notes && <div className="text-xs text-muted-foreground italic">"{t.notes}"</div>}
              </div>
            ))}
          </div>
        )}
      </div>
  );
}
