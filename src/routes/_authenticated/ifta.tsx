import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listIfta, createIfta, deleteIfta, type IftaEntry } from "@/lib/ifta.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPinned, Plus, Trash2, Loader2, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ifta")({ component: IftaPage });

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

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
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => entries.filter((e) => inQuarter(e.entry_date, filter.year, filter.quarter)), [entries, filter]);
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

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ifta"] }); toast.success("Removed"); },
  });

  function exportCsv() {
    const header = ["State","Miles","Gallons","Fuel Cost USD","MPG"];
    const rows = summary.map((s) => [s.state, s.miles.toFixed(1), s.gallons.toFixed(2), s.cost.toFixed(2), s.mpg ? s.mpg.toFixed(2) : ""]);
    const csv = [header, ...rows, ["TOTAL", totals.miles.toFixed(1), totals.gallons.toFixed(2), totals.cost.toFixed(2), totals.gallons > 0 ? (totals.miles / totals.gallons).toFixed(2) : ""]]
      .map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ifta-${filter.year}-Q${filter.quarter}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container max-w-4xl py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPinned className="size-6 text-primary" /> IFTA Mileage</h1>
          <p className="text-sm text-muted-foreground">Track miles & fuel by state for quarterly tax filings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={summary.length === 0}><Download className="size-4 mr-2" /> Export</Button>
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
    </div>
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
