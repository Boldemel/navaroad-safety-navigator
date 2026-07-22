/**
 * Dispatch History — completed & cancelled loads with filters.
 * Additive to the Dispatch module; does not alter live dashboard behaviour.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, History, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listDispatchHistory } from "@/lib/dispatch-extras.functions";

export const Route = createFileRoute("/_authenticated/dispatch/history")({
  head: () => ({
    meta: [
      { title: "Dispatch History · Navaroad FleetOS" },
      {
        name: "description",
        content:
          "Search and filter completed and cancelled dispatched loads across your fleet.",
      },
    ],
  }),
  component: DispatchHistoryPage,
});

function DispatchHistoryPage() {
  const listFn = useServerFn(listDispatchHistory);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    "all" | "completed" | "delivered" | "cancelled"
  >("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vehicleUnit, setVehicleUnit] = useState("");

  const filters = useMemo(
    () => ({
      search: search || undefined,
      status,
      from: from || undefined,
      to: to || undefined,
      vehicleUnit: vehicleUnit || undefined,
      limit: 200,
    }),
    [search, status, from, to, vehicleUnit],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["dispatch", "history", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const rows = data?.history ?? [];

  return (
    <div className="container max-w-[1200px] py-5 space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        <div className="size-11 rounded-xl bg-primary/15 flex items-center justify-center">
          <History className="size-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight">Dispatch History</h1>
          <p className="text-xs text-muted-foreground">
            Completed and cancelled loads · searchable
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dispatch">
            <ArrowLeft className="size-4 mr-1" /> Back to Dispatch
          </Link>
        </Button>
      </header>

      <section className="rounded-xl border bg-card p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-7"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="BOL, commodity, shipper, consignee, truck"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as never)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All (completed + cancelled)</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Truck unit</Label>
            <Input
              value={vehicleUnit}
              onChange={(e) => setVehicleUnit(e.target.value)}
              placeholder="e.g. 101"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Load</TableHead>
                <TableHead>Lane</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Truck</TableHead>
                <TableHead className="text-right">Miles</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Closed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                    No history matches these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.bolNumber ?? r.commodity ?? "Load"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.shipperName ?? "TBD"} → {r.consigneeName ?? "TBD"}
                    </TableCell>
                    <TableCell>{r.driverName ?? "—"}</TableCell>
                    <TableCell>{r.vehicleUnit ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.totalMiles ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.rateUsd != null ? `$${r.rateUsd.toFixed(0)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          r.dispatchStatus === "cancelled"
                            ? "text-[10px] uppercase tracking-wider text-destructive"
                            : "text-[10px] uppercase tracking-wider text-success"
                        }
                      >
                        {r.dispatchStatus.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.completedAt ?? r.updatedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
