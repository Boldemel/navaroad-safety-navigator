import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wind, Construction, AlertTriangle, Bell, Route as RouteIcon, ShieldCheck, Loader2, CloudRain, Thermometer, MapPin } from "lucide-react";
import { TRUCK_TYPES, TRAILER_TYPES, hazardLabel, severityClasses } from "@/lib/navaroad";
import { formatDistanceToNow } from "date-fns";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { analyzeRoute } from "@/lib/route-analysis.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [truck, setTruck] = useState("Sleeper");
  const [trailer, setTrailer] = useState("Dry Van");
  const [score, setScore] = useState<number | null>(null);
  useRealtimeInvalidate(["hazard_reports", "alerts"], [["dash-hazards"], ["dash-alerts"]]);



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

  const { data: alerts = [] } = useQuery({
    queryKey: ["dash-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const windCount = hazards.filter((h) => h.hazard_type === "high_wind").length
    + alerts.filter((a) => a.alert_type === "high_wind").length;
  const closureCount = hazards.filter((h) => h.hazard_type === "road_closure").length
    + alerts.filter((a) => a.alert_type === "road_closure").length;
  const driverCount = hazards.length;

  function analyze(e: React.FormEvent) {
    e.preventDefault();
    // MVP: derive a deterministic-ish score from active hazards/alerts and trailer type.
    const base = 95;
    const penalty = alerts.reduce((acc, a) => acc + (a.severity === "critical" ? 25 : a.severity === "high" ? 12 : 5), 0);
    const trailerRisk = trailer === "Reefer" || trailer === "Dry Van" ? 8 : 2;
    setScore(Math.max(35, Math.min(99, base - penalty - trailerRisk)));
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Pre-trip safety overview and active alerts.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={analyze} className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4">
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
          <Button type="submit" className="w-full sm:w-auto">Analyze Route</Button>
        </form>

        <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" /> Route Safety Score
          </div>
          <div className={`mt-3 text-6xl font-bold ${score == null ? "text-muted-foreground" : score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive"}`}>
            {score ?? "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {score == null ? "Analyze a route to see your score." : score >= 80 ? "Low risk — clear to roll." : score >= 60 ? "Caution — review alerts." : "High risk — consider delay or alt route."}
          </p>
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-3">Active Alerts</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <StatCard icon={<Wind className="size-5" />} label="High Wind Risk" count={windCount} accent="primary" />
          <StatCard icon={<Construction className="size-5" />} label="Road Closures" count={closureCount} accent="destructive" />
          <StatCard icon={<AlertTriangle className="size-5" />} label="Driver Hazard Reports" count={driverCount} accent="warning" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Recent Alerts</h2>
          <Bell className="size-4 text-muted-foreground" />
        </div>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {alerts.length === 0 && <div className="p-6 text-sm text-muted-foreground">No active alerts.</div>}
          {alerts.slice(0, 5).map((a) => (
            <div key={a.id} className="p-4 flex items-start gap-3">
              <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(a.severity)}`}>{a.severity}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{hazardLabel(a.alert_type)} — {a.location}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.message}</div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, count, accent }: { icon: React.ReactNode; label: string; count: number; accent: "primary" | "destructive" | "warning" }) {
  const colors = {
    primary: "text-primary bg-primary/10 border-primary/20",
    destructive: "text-destructive bg-destructive/10 border-destructive/20",
    warning: "text-warning bg-warning/10 border-warning/20",
  }[accent];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className={`size-10 rounded-md flex items-center justify-center border ${colors}`}>{icon}</div>
      <div className="mt-4 text-3xl font-semibold">{count}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
