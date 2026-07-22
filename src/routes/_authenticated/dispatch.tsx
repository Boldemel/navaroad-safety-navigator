import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CloudRain,
  Package,
  PackageCheck,
  PackageOpen,
  Radio,
  Sparkles,
  Timer,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dispatch/kpi-card";
import { TripTimeline } from "@/components/dispatch/trip-timeline";
import { DispatchSection, EmptyRow } from "@/components/dispatch/dispatch-section";
import { AssignmentDialog } from "@/components/dispatch/assignment-dialog";
import { AiDispatchPanel } from "@/components/dispatch/ai-dispatch-panel";
import {
  getDispatchSnapshot,
  type DispatchLoad,
  type DispatchSnapshot,
} from "@/lib/dispatch.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dispatch")({
  head: () => ({
    meta: [
      { title: "Dispatch · Navaroad FleetOS" },
      {
        name: "description",
        content:
          "Airline-ops-style dispatch workspace: assign loads, track drivers and trucks, and get AI recommendations.",
      },
    ],
  }),
  component: DispatchPage,
});

const snapshotQO = () =>
  queryOptions<DispatchSnapshot>({
    queryKey: ["dispatch", "snapshot"],
    queryFn: () => getDispatchSnapshot(),
    refetchInterval: 30_000,
  });

function DispatchPage() {
  const fetchSnapshot = useServerFn(getDispatchSnapshot);
  const { data: snapshot } = useSuspenseQuery({
    ...snapshotQO(),
    queryFn: () => fetchSnapshot(),
  });

  const [assignLoad, setAssignLoad] = useState<DispatchLoad | null>(null);

  const activeLoads = snapshot.loads.filter((l) =>
    ["assigned", "accepted", "driving_to_pickup", "loaded", "in_transit"].includes(
      l.dispatchStatus,
    ),
  );
  const unassignedLoads = snapshot.loads.filter(
    (l) => l.dispatchStatus === "unassigned" && !l.driverId,
  );
  const dueToday = snapshot.loads.filter(
    (l) =>
      l.deliveryAt &&
      new Date(l.deliveryAt).toDateString() === new Date().toDateString(),
  );

  return (
    <div className="container max-w-[1400px] py-5 space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        <div className="size-11 rounded-xl bg-primary/15 flex items-center justify-center">
          <Radio className="size-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight">Dispatch</h1>
          <p className="text-xs text-muted-foreground">
            Live operations center · updated every 30 s
          </p>
        </div>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Active Loads" value={snapshot.overview.activeLoads} icon={Package} tone="primary" />
        <KpiCard label="Unassigned" value={snapshot.overview.unassignedLoads} icon={PackageOpen} tone={snapshot.overview.unassignedLoads > 0 ? "warning" : "default"} />
        <KpiCard label="Available Drivers" value={snapshot.overview.availableDrivers} icon={Users} tone="success" />
        <KpiCard label="Available Trucks" value={snapshot.overview.availableTrucks} icon={Truck} tone="success" />
        <KpiCard label="Drivers In Transit" value={snapshot.overview.driversInTransit} icon={Truck} tone="primary" />
        <KpiCard label="Drivers Waiting" value={snapshot.overview.driversWaiting} icon={Timer} tone="default" />
        <KpiCard label="Deliveries Due Today" value={snapshot.overview.deliveriesDueToday} icon={Calendar} tone={snapshot.overview.deliveriesDueToday > 0 ? "warning" : "default"} />
        <KpiCard label="Weather Alerts" value={snapshot.overview.weatherAlerts} icon={CloudRain} tone={snapshot.overview.weatherAlerts > 0 ? "destructive" : "default"} />
        <KpiCard label="AI Recommendations" value={snapshot.overview.aiRecommendations} icon={Sparkles} tone={snapshot.overview.aiRecommendations > 0 ? "primary" : "default"} />
        <KpiCard label="Total Loads Today" value={dueToday.length + activeLoads.length} icon={CheckCircle2} tone="default" />
      </div>

      {/* Main grid: dispatch board + AI panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Active loads with timeline */}
          <DispatchSection title="Active Loads" icon={Package} count={activeLoads.length}>
            {activeLoads.length === 0 ? (
              <EmptyRow>No active loads. Assign an unassigned load to get started.</EmptyRow>
            ) : (
              <ul className="space-y-2">
                {activeLoads.map((l) => (
                  <LoadRow key={l.id} load={l} onClick={() => setAssignLoad(l)} />
                ))}
              </ul>
            )}
          </DispatchSection>

          {/* Two-up: unassigned + due today */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DispatchSection title="Unassigned Loads" icon={PackageOpen} count={unassignedLoads.length}>
              {unassignedLoads.length === 0 ? (
                <EmptyRow>All loads assigned.</EmptyRow>
              ) : (
                <ul className="space-y-1.5">
                  {unassignedLoads.map((l) => (
                    <CompactLoadRow key={l.id} load={l} action="Assign" onClick={() => setAssignLoad(l)} />
                  ))}
                </ul>
              )}
            </DispatchSection>

            <DispatchSection title="Deliveries Due Today" icon={Calendar} count={dueToday.length}>
              {dueToday.length === 0 ? (
                <EmptyRow>No deliveries scheduled today.</EmptyRow>
              ) : (
                <ul className="space-y-1.5">
                  {dueToday.map((l) => (
                    <CompactLoadRow
                      key={l.id}
                      load={l}
                      action={l.driverId ? "Update" : "Assign"}
                      onClick={() => setAssignLoad(l)}
                    />
                  ))}
                </ul>
              )}
            </DispatchSection>
          </div>

          {/* Drivers & trucks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DispatchSection
              title="Available Drivers"
              icon={Users}
              count={snapshot.drivers.filter((d) => d.status === "available").length}
            >
              <DriverList
                drivers={snapshot.drivers}
                filter={(d) => d.status === "available"}
                emptyText="No drivers currently available."
              />
            </DispatchSection>

            <DispatchSection
              title="Available Trucks"
              icon={Truck}
              count={snapshot.trucks.filter((t) => t.status === "available").length}
            >
              {snapshot.trucks.filter((t) => t.status === "available").length === 0 ? (
                <EmptyRow>All trucks in use.</EmptyRow>
              ) : (
                <ul className="space-y-1">
                  {snapshot.trucks
                    .filter((t) => t.status === "available")
                    .map((t) => (
                      <li
                        key={t.vehicleUnit}
                        className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm"
                      >
                        <div className="size-7 rounded-md bg-success/10 flex items-center justify-center text-success">
                          <Truck className="size-3.5" />
                        </div>
                        <span className="font-medium">Truck {t.vehicleUnit}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wider text-success">
                          Available
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </DispatchSection>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DispatchSection
              title="Drivers In Transit"
              icon={Truck}
              count={snapshot.overview.driversInTransit}
            >
              <DriverList
                drivers={snapshot.drivers}
                filter={(d) => d.status === "in_transit"}
                emptyText="No drivers in transit right now."
              />
            </DispatchSection>
            <DispatchSection
              title="Drivers Waiting"
              icon={Timer}
              count={snapshot.overview.driversWaiting}
            >
              <DriverList
                drivers={snapshot.drivers}
                filter={(d) => d.status === "waiting"}
                emptyText="No drivers waiting at a pickup or drop."
              />
            </DispatchSection>
          </div>
        </div>

        {/* Right column: AI + alerts */}
        <div className="space-y-4">
          <AiDispatchPanel snapshot={snapshot} />

          <DispatchSection
            title="AI Recommendations"
            icon={Sparkles}
            count={snapshot.recommendations.length}
          >
            {snapshot.recommendations.length === 0 ? (
              <EmptyRow>No new recommendations. FleetOS AI is watching.</EmptyRow>
            ) : (
              <ul className="space-y-2">
                {snapshot.recommendations.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-primary/20 bg-primary/5 p-2.5"
                  >
                    <div className="text-sm font-semibold leading-tight">
                      {r.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.detail}
                    </div>
                    {r.loadId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 mt-1 text-xs"
                        onClick={() => {
                          const l = snapshot.loads.find((x) => x.id === r.loadId);
                          if (l) setAssignLoad(l);
                        }}
                      >
                        Review <ArrowRight className="size-3 ml-1" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </DispatchSection>

          <DispatchSection
            title="Weather Alerts"
            icon={CloudRain}
            count={snapshot.weather.length}
          >
            {snapshot.weather.length === 0 ? (
              <EmptyRow>
                <div className="flex flex-col items-center gap-1">
                  <CheckCircle2 className="size-4 text-success" />
                  Clear across your active lanes.
                </div>
              </EmptyRow>
            ) : (
              <ul className="space-y-2">
                {snapshot.weather.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-md border border-warning/30 bg-warning/5 p-2 text-sm"
                  >
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="size-3.5 text-warning" />
                      {w.region}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {w.message}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DispatchSection>
        </div>
      </div>

      <AssignmentDialog
        open={!!assignLoad}
        onOpenChange={(v) => !v && setAssignLoad(null)}
        load={assignLoad}
        drivers={snapshot.drivers}
        trucks={snapshot.trucks}
      />
    </div>
  );
}

function LoadRow({
  load,
  onClick,
}: {
  load: DispatchLoad;
  onClick: () => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-background p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {load.bolNumber ?? load.commodity ?? "Load"}
            <span className="text-muted-foreground font-normal">
              {" · "}
              {load.shipperName ?? "TBD"} → {load.consigneeName ?? "TBD"}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {load.driverName ?? "Unassigned"}
            {load.vehicleUnit ? ` · Truck ${load.vehicleUnit}` : ""}
            {load.totalMiles ? ` · ${load.totalMiles} mi` : ""}
            {load.rateUsd != null ? ` · $${load.rateUsd.toFixed(0)}` : ""}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onClick}>
          Manage
        </Button>
      </div>
      <TripTimeline status={load.dispatchStatus} />
    </li>
  );
}

function CompactLoadRow({
  load,
  action,
  onClick,
}: {
  load: DispatchLoad;
  action: string;
  onClick: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {load.bolNumber ?? load.commodity ?? "Load"}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {load.shipperName ?? "TBD"} → {load.consigneeName ?? "TBD"}
          {load.deliveryAt ? ` · due ${new Date(load.deliveryAt).toLocaleDateString()}` : ""}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={onClick}>
        {action}
      </Button>
    </li>
  );
}

function DriverList({
  drivers,
  filter,
  emptyText,
}: {
  drivers: DispatchSnapshot["drivers"];
  filter: (d: DispatchSnapshot["drivers"][number]) => boolean;
  emptyText: string;
}) {
  const list = drivers.filter(filter);
  if (list.length === 0) return <EmptyRow>{emptyText}</EmptyRow>;
  return (
    <ul className="space-y-1">
      {list.map((d) => (
        <li
          key={d.userId}
          className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <div
            className={cn(
              "size-7 rounded-md flex items-center justify-center",
              d.status === "available" && "bg-success/10 text-success",
              d.status === "in_transit" && "bg-primary/10 text-primary",
              d.status === "waiting" && "bg-warning/10 text-warning",
              d.status === "off_duty" && "bg-muted text-muted-foreground",
            )}
          >
            <Users className="size-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{d.name}</div>
            {d.assignedTruck ? (
              <div className="text-[11px] text-muted-foreground">
                Truck {d.assignedTruck}
              </div>
            ) : null}
          </div>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider",
              d.status === "available" && "text-success",
              d.status === "in_transit" && "text-primary",
              d.status === "waiting" && "text-warning",
              d.status === "off_duty" && "text-muted-foreground",
            )}
          >
            {d.status.replace("_", " ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Prevent unused-import complaints for icons only referenced conditionally in JSX above.
void PackageCheck;
