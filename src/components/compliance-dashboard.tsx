import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDriverComplianceMatrix, COMPLIANCE_CATEGORIES, type DriverCategorySummary } from "@/lib/compliance.functions";
import { Loader2, ShieldCheck, ShieldAlert, AlertTriangle, CircleSlash, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function scoreTone(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function CategoryCell({ s }: { s: DriverCategorySummary }) {
  if (s.missing) {
    return (
      <div className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
        <CircleSlash className="size-3.5" />
        <span>Missing</span>
      </div>
    );
  }
  if (s.expired > 0) {
    return (
      <div className="flex flex-col items-center gap-0.5 text-[10px] text-destructive font-medium">
        <ShieldAlert className="size-3.5" />
        <span>{s.expired} expired</span>
      </div>
    );
  }
  if (s.soon > 0) {
    return (
      <div className="flex flex-col items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
        <AlertTriangle className="size-3.5" />
        <span>{s.earliestDaysUntil}d left</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-3.5" />
      <span>{s.total}</span>
    </div>
  );
}

export function ComplianceDashboard() {
  const fetchMatrix = useServerFn(getDriverComplianceMatrix);
  const { data, isLoading } = useQuery({
    queryKey: ["compliance-matrix"],
    queryFn: () => fetchMatrix(),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data || data.rows.length === 0) {
    return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No drivers found.</div>;
  }

  const { rows, totals } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Drivers" value={totals.drivers} icon={<ShieldCheck className="size-4" />} />
        <Stat label="Expired" value={totals.expired} tone={totals.expired > 0 ? "destructive" : undefined} />
        <Stat label="Expiring 30d" value={totals.soon} tone={totals.soon > 0 ? "amber" : undefined} />
        <Stat label="Missing categories" value={totals.missing} tone={totals.missing > 0 ? "amber" : undefined} />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 sticky left-0 bg-muted/40 z-10">Driver</th>
              <th className="text-center px-2 py-2">Score</th>
              {COMPLIANCE_CATEGORIES.map((c) => (
                <th key={c} className="text-center px-2 py-2 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.driverId} className="border-t border-border">
                <td className="px-3 py-2 sticky left-0 bg-card z-10">
                  <div className="font-medium text-sm">{r.driverName}</div>
                  <div className="text-[10px] text-muted-foreground">{r.totalDocs} doc{r.totalDocs === 1 ? "" : "s"}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className={cn("text-base font-bold tabular-nums", scoreTone(r.complianceScore))}>
                    {r.complianceScore}
                  </span>
                </td>
                {COMPLIANCE_CATEGORIES.map((c) => (
                  <td key={c} className="px-2 py-2 text-center">
                    <CategoryCell s={r.categories[c]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone?: "destructive" | "amber"; icon?: React.ReactNode }) {
  return (
    <div className={cn(
      "rounded-lg border p-3",
      tone === "destructive" && "border-destructive/40 bg-destructive/5",
      tone === "amber" && "border-amber-500/40 bg-amber-500/5",
      !tone && "border-border bg-card",
    )}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={cn("text-xl font-bold tabular-nums",
        tone === "destructive" && "text-destructive",
        tone === "amber" && "text-amber-600 dark:text-amber-400",
      )}>{value}</div>
    </div>
  );
}
