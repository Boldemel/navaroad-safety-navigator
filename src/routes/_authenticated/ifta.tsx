import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listIfta, createIfta, deleteIfta, type IftaEntry } from "@/lib/ifta.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPinned, Plus, Trash2, Loader2, Download, Printer, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";

export const Route = createFileRoute("/_authenticated/ifta")({ component: IftaPage });

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function quarterRange(year: number, q: number) {
  const startMonth = (q - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  return { start, end };
}

function currentQuarter(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return { year: d.getFullYear(), quarter: q };
}
function inQuarter(dateStr: string, year: number, quarter: number) {
  const d = new Date(dateStr);
  return d.getFullYear() === year && Math.floor(d.getMonth() / 3) + 1 === quarter;
}

function IftaPage() {
  const fetchAll = useServerFn(listIfta);
  const create = useServerFn(createIfta);
  const remove = useServerFn(deleteIfta);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["ifta"], queryFn: () => fetchAll() });
  const entries = data?.entries ?? [];
  const [filter, setFilter] = useState(currentQuarter());
  const [fleet, setFleet] = useState<FleetFilterValue>(emptyFleetFilters);
  const [showForm, setShowForm] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile-min"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: p } = await supabase.from("profiles").select("driver_name,truck_type,trailer_type").eq("id", u.user.id).maybeSingle();
      return { ...p, email: u.user.email };
    },
  });

  const filtered = useMemo(() => entries.filter((e) => {
    if (!inQuarter(e.entry_date, filter.year, filter.quarter)) return false;
    if (fleet.truck && (e as any).vehicle_unit !== fleet.truck) return false;
    if (fleet.driverId && (e as any).driver_id !== fleet.driverId) return false;
    if (fleet.from && e.entry_date < fleet.from) return false;
    if (fleet.to && e.entry_date > fleet.to) return false;
    return true;
  }), [entries, filter, fleet]);
  const summary = useMemo(() => {
    const map = new Map<string, { miles: number; gallons: number; cost: number }>();
    for (const e of filtered) {
      const cur = map.get(e.state_code) ?? { miles: 0, gallons: 0, cost: 0 };
      cur.miles += Number(e.miles) || 0;
      cur.gallons += Number(e.fuel_gallons) || 0;
      cur.cost += Number(e.fuel_cost_usd) || 0;
      map.set(e.state_code, cur);
    }
    return Array.from(map.entries()).map(([state, s]) => ({ state, ...s, mpg: s.gallons > 0 ? s.miles / s.gallons : null })).sort((a, b) => b.miles - a.miles);
  }, [filtered]);

  const totals = summary.reduce((acc, s) => ({ miles: acc.miles + s.miles, gallons: acc.gallons + s.gallons, cost: acc.cost + s.cost }), { miles: 0, gallons: 0, cost: 0 });
  const fleetMpg = totals.gallons > 0 ? totals.miles / totals.gallons : null;

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ifta"] }); toast.success("Removed"); },
  });

  function exportCsv() {
    const meta = [
      ["IFTA Quarterly Report"],
      [`Period`, `Q${filter.quarter} ${filter.year}`],
      [`Driver`, profile?.driver_name ?? ""],
      [`Generated`, new Date().toISOString()],
      [],
    ];
    const header = ["State","Miles","Gallons","Fuel Cost USD","MPG"];
    const rows = summary.map((s) => [s.state, s.miles.toFixed(1), s.gallons.toFixed(2), s.cost.toFixed(2), s.mpg ? s.mpg.toFixed(2) : ""]);
    const totalRow = ["TOTAL", totals.miles.toFixed(1), totals.gallons.toFixed(2), totals.cost.toFixed(2), fleetMpg ? fleetMpg.toFixed(2) : ""];
    const detail = [[], ["Detail Entries"], ["Date","State","Miles","Gallons","Fuel Cost USD","Notes"]];
    const detailRows = filtered
      .slice()
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .map((e) => [e.entry_date, e.state_code, Number(e.miles).toFixed(1), Number(e.fuel_gallons).toFixed(2), e.fuel_cost_usd ? Number(e.fuel_cost_usd).toFixed(2) : "", (e.notes ?? "").replace(/[\r\n,]+/g, " ")]);
    const all = [...meta, header, ...rows, totalRow, ...detail, ...detailRows];
    const csv = all.map((r) => r.map((c) => /[,"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ifta-${filter.year}-Q${filter.quarter}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  return (
    <div className="container max-w-4xl py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPinned className="size-6 text-primary" /> IFTA Mileage</h1>
          <p className="text-sm text-muted-foreground">Track miles & fuel by state for quarterly tax filings</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowReport(true)} disabled={summary.length === 0}><FileText className="size-4 mr-2" /> Report</Button>
          <Button variant="outline" onClick={exportCsv} disabled={summary.length === 0}><Download className="size-4 mr-2" /> CSV</Button>
          <Button onClick={() => setShowForm((v) => !v)}><Plus className="size-4 mr-2" /> Add</Button>
        </div>
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <Label className="text-xs">Year</Label>
          <Input type="number" className="w-24" value={filter.year} onChange={(e) => setFilter({ ...filter, year: parseInt(e.target.value) || filter.year })} />
        </div>
        <div>
          <Label className="text-xs">Quarter</Label>
          <select value={filter.quarter} onChange={(e) => setFilter({ ...filter, quarter: parseInt(e.target.value) })} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value={1}>Q1 (Jan–Mar)</option>
            <option value={2}>Q2 (Apr–Jun)</option>
            <option value={3}>Q3 (Jul–Sep)</option>
            <option value={4}>Q4 (Oct–Dec)</option>
          </select>
        </div>
      </div>

      {showForm && <IftaForm onClose={() => setShowForm(false)} onSubmit={async (p) => {
        try { await create({ data: p }); qc.invalidateQueries({ queryKey: ["ifta"] }); toast.success("Entry added"); setShowForm(false); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
      }} />}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wide">Quarter Summary · Q{filter.quarter} {filter.year}</div>
        {summary.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No entries for this quarter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr><th className="text-left px-3 py-2">State</th><th className="text-right px-3 py-2">Miles</th><th className="text-right px-3 py-2">Gallons</th><th className="text-right px-3 py-2">MPG</th><th className="text-right px-3 py-2">Fuel $</th></tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.state} className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium">{s.state}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.miles.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.gallons.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.mpg ? s.mpg.toFixed(2) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${s.cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-muted/20">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.miles.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.gallons.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.gallons > 0 ? (totals.miles / totals.gallons).toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${totals.cost.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entries (quarter)</div>
        {isLoading ? <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> :
          filtered.length === 0 ? <div className="text-sm text-muted-foreground">No entries.</div> :
          filtered.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <div className="flex gap-3 min-w-0">
                <span className="font-mono text-xs text-muted-foreground w-20">{e.entry_date}</span>
                <span className="font-semibold w-8">{e.state_code}</span>
                <span className="tabular-nums">{Number(e.miles).toFixed(1)} mi</span>
                <span className="tabular-nums text-muted-foreground">{Number(e.fuel_gallons).toFixed(2)} gal</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete?")) del.mutate(e.id); }}><Trash2 className="size-4 text-muted-foreground" /></Button>
            </div>
          ))
        }
      </div>

      <IftaReportDialog
        open={showReport}
        onClose={() => setShowReport(false)}
        year={filter.year}
        quarter={filter.quarter}
        summary={summary}
        totals={totals}
        fleetMpg={fleetMpg}
        entries={filtered}
        driverName={profile?.driver_name ?? null}
        driverEmail={profile?.email ?? null}
        truckType={profile?.truck_type ?? null}
        trailerType={profile?.trailer_type ?? null}
      />
    </div>
  );
}

type SummaryRow = { state: string; miles: number; gallons: number; cost: number; mpg: number | null };

function IftaReportDialog(props: {
  open: boolean;
  onClose: () => void;
  year: number;
  quarter: number;
  summary: SummaryRow[];
  totals: { miles: number; gallons: number; cost: number };
  fleetMpg: number | null;
  entries: IftaEntry[];
  driverName: string | null;
  driverEmail: string | null;
  truckType: string | null;
  trailerType: string | null;
}) {
  const { open, onClose, year, quarter, summary, totals, fleetMpg, entries, driverName, driverEmail, truckType, trailerType } = props;
  const { start, end } = quarterRange(year, quarter);
  const dateFmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const generatedAt = new Date().toLocaleString();
  const sortedEntries = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #ifta-print-area, #ifta-print-area * { visibility: visible !important; }
            #ifta-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 24px !important; background: white !important; color: black !important; }
            #ifta-print-area .no-print { display: none !important; }
            @page { size: letter; margin: 0.5in; }
          }
        `}</style>
        <DialogHeader className="px-6 pt-6 pb-3 border-b no-print">
          <DialogTitle className="flex items-center gap-2"><FileText className="size-5" /> IFTA Report Preview — Q{quarter} {year}</DialogTitle>
        </DialogHeader>

        <div id="ifta-print-area" className="px-6 py-5 print:p-0 print:text-black">
          {/* Letterhead */}
          <div className="border-b-2 border-foreground/80 pb-3 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-bold">IFTA Quarterly Mileage Report</div>
                <div className="text-sm text-muted-foreground print:text-gray-700">International Fuel Tax Agreement</div>
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold">Q{quarter} {year}</div>
                <div className="text-muted-foreground print:text-gray-700">{dateFmt(start)} – {dateFmt(end)}</div>
              </div>
            </div>
          </div>

          {/* Driver / vehicle block */}
          <div className="grid grid-cols-2 gap-4 text-xs mb-5">
            <div className="space-y-1">
              <div><span className="font-semibold uppercase text-[10px] tracking-wider">Driver</span></div>
              <div className="text-sm">{driverName || "—"}</div>
              {driverEmail && <div className="text-muted-foreground print:text-gray-700">{driverEmail}</div>}
            </div>
            <div className="space-y-1">
              <div><span className="font-semibold uppercase text-[10px] tracking-wider">Vehicle</span></div>
              <div className="text-sm">{truckType || "—"}{trailerType ? ` / ${trailerType}` : ""}</div>
              <div className="text-muted-foreground print:text-gray-700">Report generated {generatedAt}</div>
            </div>
          </div>

          {/* Headline totals */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "Total Miles", value: totals.miles.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
              { label: "Total Gallons", value: totals.gallons.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
              { label: "Fleet MPG", value: fleetMpg ? fleetMpg.toFixed(2) : "—" },
              { label: "Fuel Spend", value: `$${totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            ].map((s) => (
              <div key={s.label} className="border border-foreground/30 rounded p-2 print:rounded-none">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground print:text-gray-700">{s.label}</div>
                <div className="text-base font-semibold tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Per-state summary */}
          <div className="mb-5">
            <div className="text-sm font-semibold mb-2 uppercase tracking-wide">Mileage & Fuel by Jurisdiction</div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-y-2 border-foreground/80">
                  <th className="text-left py-1.5 px-2">State</th>
                  <th className="text-right py-1.5 px-2">Taxable Miles</th>
                  <th className="text-right py-1.5 px-2">Fuel (gal)</th>
                  <th className="text-right py-1.5 px-2">MPG</th>
                  <th className="text-right py-1.5 px-2">Fuel Cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.state} className="border-b border-foreground/20">
                    <td className="py-1 px-2 font-medium">{s.state}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{s.miles.toFixed(1)}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{s.gallons.toFixed(2)}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{s.mpg ? s.mpg.toFixed(2) : "—"}</td>
                    <td className="py-1 px-2 text-right tabular-nums">${s.cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t-2 border-foreground/80">
                  <td className="py-1.5 px-2">TOTAL</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{totals.miles.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{totals.gallons.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fleetMpg ? fleetMpg.toFixed(2) : "—"}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">${totals.cost.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Detail entries */}
          <div className="break-before-page">
            <div className="text-sm font-semibold mb-2 uppercase tracking-wide">Detail Entries</div>
            {sortedEntries.length === 0 ? (
              <div className="text-xs italic text-muted-foreground">No entries for this quarter.</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-y-2 border-foreground/80">
                    <th className="text-left py-1.5 px-2">Date</th>
                    <th className="text-left py-1.5 px-2">State</th>
                    <th className="text-right py-1.5 px-2">Miles</th>
                    <th className="text-right py-1.5 px-2">Gallons</th>
                    <th className="text-right py-1.5 px-2">Fuel $</th>
                    <th className="text-left py-1.5 px-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((e) => (
                    <tr key={e.id} className="border-b border-foreground/20">
                      <td className="py-1 px-2 font-mono">{e.entry_date}</td>
                      <td className="py-1 px-2 font-medium">{e.state_code}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{Number(e.miles).toFixed(1)}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{Number(e.fuel_gallons).toFixed(2)}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{e.fuel_cost_usd ? `$${Number(e.fuel_cost_usd).toFixed(2)}` : "—"}</td>
                      <td className="py-1 px-2 text-muted-foreground print:text-gray-700">{e.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Certification footer */}
          <div className="mt-8 pt-4 border-t border-foreground/40 text-[10px] text-muted-foreground print:text-gray-700">
            I certify under penalty of perjury that the information on this report is true, accurate, and complete to the best of my knowledge.
            <div className="grid grid-cols-2 gap-6 mt-6">
              <div><div className="border-b border-foreground/60 h-6"></div><div className="mt-1">Driver signature</div></div>
              <div><div className="border-b border-foreground/60 h-6"></div><div className="mt-1">Date</div></div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t no-print">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()}><Printer className="size-4 mr-2" /> Print / Save PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IftaForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (p: { entryDate: string; stateCode: string; miles: number; fuelGallons: number; fuelCostUsd: number | null; notes: string | null }) => void | Promise<void> }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [state, setState] = useState("TX");
  const [miles, setMiles] = useState("");
  const [gallons, setGallons] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">New IFTA Entry</div>
      <div className="grid sm:grid-cols-5 gap-2">
        <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div>
          <Label className="text-xs">State</Label>
          <select value={state} onChange={(e) => setState(e.target.value)} className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Miles</Label><Input type="number" step="0.1" value={miles} onChange={(e) => setMiles(e.target.value)} /></div>
        <div><Label className="text-xs">Gallons</Label><Input type="number" step="0.01" value={gallons} onChange={(e) => setGallons(e.target.value)} /></div>
        <div><Label className="text-xs">Fuel cost $</Label><Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
      </div>
      <div><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submitting} onClick={async () => {
          if (!miles) { toast.error("Miles required"); return; }
          setSubmitting(true);
          try { await onSubmit({ entryDate: date, stateCode: state, miles: parseFloat(miles), fuelGallons: parseFloat(gallons || "0"), fuelCostUsd: cost ? parseFloat(cost) : null, notes: notes || null }); }
          finally { setSubmitting(false); }
        }}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}Add entry</Button>
      </div>
    </div>
  );
}
