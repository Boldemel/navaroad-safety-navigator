import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { FileBarChart, Download, Loader2, AlertTriangle, Truck, Users, FolderLock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";
import { getFleetReport, type DocExpirationRow, type DriverReportRow, type TruckReportRow } from "@/lib/reports.functions";
import { downloadFleetReportPdf, type PdfTableSection } from "@/lib/pdf-export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

const fmt$ = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const [filters, setFilters] = useState<FleetFilterValue>(emptyFleetFilters);
  const fetchReport = useServerFn(getFleetReport);
  const payload = useMemo(() => ({
    from: filters.from || undefined,
    to: filters.to || undefined,
    truck: filters.truck || undefined,
    driverId: filters.driverId || undefined,
  }), [filters]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fleet-report", payload],
    queryFn: () => fetchReport({ data: payload }),
  });

  return (
    <div className="container max-w-7xl py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileBarChart className="size-6 text-primary" /> Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Per-truck and per-driver operational, financial, and compliance reports
        </p>
      </div>

      <FleetFilters value={filters} onChange={setFilters} />

      {error && (
        <Card className="p-4 text-sm text-destructive">
          {(error as Error).message}
        </Card>
      )}

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="size-4 animate-spin" /> Building report…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Kpi label="Revenue" value={fmt$(data.totals.revenue)} />
            <Kpi label="Miles" value={data.totals.miles.toLocaleString()} />
            <Kpi label="Loads" value={data.totals.loads.toLocaleString()} />
            <Kpi label="Fuel" value={fmt$(data.totals.fuelCost)} />
            <Kpi label="Maintenance" value={fmt$(data.totals.maintenanceCost)} />
            <Kpi
              label="Doc alerts"
              value={`${data.totals.expiredDocs + data.totals.expiringDocs}`}
              tone={data.totals.expiredDocs > 0 ? "bad" : undefined}
            />
          </div>

          <Tabs defaultValue="truck" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="truck"><Truck className="size-4 mr-1.5" /> By Truck</TabsTrigger>
              <TabsTrigger value="driver"><Users className="size-4 mr-1.5" /> By Driver</TabsTrigger>
              <TabsTrigger value="docs"><FolderLock className="size-4 mr-1.5" /> Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="truck" className="mt-4">
              <TruckTable rows={data.byTruck} />
            </TabsContent>
            <TabsContent value="driver" className="mt-4">
              <DriverTable rows={data.byDriver} />
            </TabsContent>
            <TabsContent value="docs" className="mt-4">
              <DocsTable rows={data.docExpirations} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card className="p-3 space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold",
        tone === "good" && "text-primary",
        tone === "bad" && "text-destructive")}>{value}</div>
    </Card>
  );
}

/* -------- Tables -------- */

function TruckTable({ rows }: { rows: TruckReportRow[] }) {
  const exportCsv = () => {
    const header = ["Vehicle", "Loads", "Miles", "Revenue", "Fuel", "Maintenance", "Inspections", "Open defects", "Last inspection"];
    const body = rows.map((r) => [
      r.vehicleUnit, r.loads, r.miles, r.revenue.toFixed(2),
      r.fuelCost.toFixed(2), r.maintenanceCost.toFixed(2),
      r.inspections, r.openDefects, r.lastInspectionAt ?? "",
    ]);
    downloadCsv(`truck-report-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <Card className="overflow-x-auto">
      <div className="flex justify-end p-2 border-b border-border">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download className="size-4 mr-1.5" /> CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No truck activity in this range.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <Th>Vehicle</Th>
              <Th right>Loads</Th>
              <Th right>Miles</Th>
              <Th right>Revenue</Th>
              <Th right>Fuel</Th>
              <Th right>Maintenance</Th>
              <Th right>DVIRs</Th>
              <Th right>Open defects</Th>
              <Th right>Last DVIR</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.vehicleUnit} className="border-b border-border last:border-0">
                <Td><span className="font-medium">{r.vehicleUnit}</span></Td>
                <Td right>{r.loads}</Td>
                <Td right>{r.miles.toLocaleString()}</Td>
                <Td right>{fmt$(r.revenue)}</Td>
                <Td right>{fmt$(r.fuelCost)}</Td>
                <Td right>{fmt$(r.maintenanceCost)}</Td>
                <Td right>{r.inspections}</Td>
                <Td right><span className={cn(r.openDefects > 0 && "text-destructive font-medium")}>{r.openDefects}</span></Td>
                <Td right>{r.lastInspectionAt ? new Date(r.lastInspectionAt).toLocaleDateString() : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function DriverTable({ rows }: { rows: DriverReportRow[] }) {
  const exportCsv = () => {
    const header = ["Driver", "Loads", "Miles", "Revenue", "Pre-trip", "Post-trip", "Open defects", "Expiring docs"];
    const body = rows.map((r) => [
      r.name, r.loads, r.miles, r.revenue.toFixed(2),
      r.preTrip, r.postTrip, r.openDefects, r.expiringDocs,
    ]);
    downloadCsv(`driver-report-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <Card className="overflow-x-auto">
      <div className="flex justify-end p-2 border-b border-border">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download className="size-4 mr-1.5" /> CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No driver activity in this range.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <Th>Driver</Th>
              <Th right>Loads</Th>
              <Th right>Miles</Th>
              <Th right>Revenue</Th>
              <Th right>Pre-trip</Th>
              <Th right>Post-trip</Th>
              <Th right>Open defects</Th>
              <Th right>Expiring docs</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.driverId} className="border-b border-border last:border-0">
                <Td><span className="font-medium">{r.name}</span></Td>
                <Td right>{r.loads}</Td>
                <Td right>{r.miles.toLocaleString()}</Td>
                <Td right>{fmt$(r.revenue)}</Td>
                <Td right>{r.preTrip}</Td>
                <Td right>{r.postTrip}</Td>
                <Td right><span className={cn(r.openDefects > 0 && "text-destructive font-medium")}>{r.openDefects}</span></Td>
                <Td right><span className={cn(r.expiringDocs > 0 && "text-amber-600 dark:text-amber-400 font-medium")}>{r.expiringDocs}</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function DocsTable({ rows }: { rows: DocExpirationRow[] }) {
  const exportCsv = () => {
    const header = ["Title", "Type", "Category", "Driver", "Expires on", "Days until", "Status"];
    const body = rows.map((r) => [
      r.title, r.docType, r.category ?? "", r.driverName ?? "",
      r.expiresOn ?? "", r.daysUntil ?? "", r.status,
    ]);
    downloadCsv(`document-expirations-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <Card className="overflow-x-auto">
      <div className="flex justify-end p-2 border-b border-border">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download className="size-4 mr-1.5" /> CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No documents tracked yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <Th>Document</Th>
              <Th>Type</Th>
              <Th>Category</Th>
              <Th>Driver</Th>
              <Th right>Expires</Th>
              <Th right>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <Td><span className="font-medium">{r.title}</span></Td>
                <Td>{r.docType}</Td>
                <Td>{r.category ?? "—"}</Td>
                <Td>{r.driverName ?? "—"}</Td>
                <Td right>
                  {r.expiresOn ? (
                    <span>
                      {r.expiresOn}
                      {r.daysUntil != null && (
                        <span className="text-muted-foreground"> ({r.daysUntil < 0 ? `${-r.daysUntil}d ago` : `${r.daysUntil}d`})</span>
                      )}
                    </span>
                  ) : "—"}
                </Td>
                <Td right>
                  {r.status === "expired" && (
                    <span className="inline-flex items-center gap-1 text-destructive font-medium">
                      <AlertTriangle className="size-3" /> Expired
                    </span>
                  )}
                  {r.status === "soon" && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">Expiring</span>
                  )}
                  {r.status === "ok" && (
                    <span className="text-muted-foreground">OK</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-3 py-2 font-medium", right ? "text-right" : "text-left")}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={cn("px-3 py-2 align-middle", right && "text-right tabular-nums")}>{children}</td>;
}
