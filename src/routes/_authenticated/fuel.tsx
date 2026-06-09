import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFuel, createFuel, updateFuel, deleteFuel, type FuelPurchase } from "@/lib/fuel.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Fuel, Plus, Trash2, Loader2, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";

export const Route = createFileRoute("/_authenticated/fuel")({ component: FuelPage });

function FuelPage() {
  const fetchAll = useServerFn(listFuel);
  const create = useServerFn(createFuel);
  const update = useServerFn(updateFuel);
  const remove = useServerFn(deleteFuel);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FuelPurchase | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["fuel"], queryFn: () => fetchAll() });
  const rows = data?.purchases ?? [];

  const summary = useMemo(() => {
    let gallons = 0, cost = 0;
    const byState: Record<string, { gal: number; cost: number }> = {};
    let prevOdo: number | null = null, milesSince = 0;
    const mpgs: number[] = [];
    const sorted = [...rows].sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));
    for (const r of sorted) {
      const g = Number(r.gallons) || 0;
      const c = Number(r.total_cost_usd) || 0;
      gallons += g; cost += c;
      const s = byState[r.state_code] ?? { gal: 0, cost: 0 };
      s.gal += g; s.cost += c; byState[r.state_code] = s;
      if (r.odometer != null && prevOdo != null) {
        milesSince = r.odometer - prevOdo;
        if (milesSince > 0 && g > 0) mpgs.push(milesSince / g);
      }
      if (r.odometer != null) prevOdo = r.odometer;
    }
    const avgMpg = mpgs.length ? mpgs.reduce((a, b) => a + b, 0) / mpgs.length : 0;
    return { gallons, cost, avgMpg, byState };
  }, [rows]);

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fuel"] }); toast.success("Deleted"); },
  });

  function exportCsv() {
    const lines = [["Date","State","Station","Gallons","$/Gal","Total","Odometer","Unit","Notes"]];
    for (const r of rows) lines.push([r.purchase_date, r.state_code, r.station_name ?? "", String(r.gallons), String(r.price_per_gallon), String(r.total_cost_usd), r.odometer?.toString() ?? "", r.vehicle_unit ?? "", (r.notes ?? "").replace(/\n/g, " ")]);
    const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `fuel-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container max-w-3xl py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Fuel className="size-6 text-primary" /> Fuel Log</h1>
          <p className="text-sm text-muted-foreground">Track every fuel stop · feeds IFTA & MPG</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="size-4 mr-2" /> CSV</Button>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4 mr-2" /> Add</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Gallons</div><div className="text-xl font-bold">{summary.gallons.toFixed(1)}</div></div>
        <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Spent</div><div className="text-xl font-bold">${summary.cost.toFixed(2)}</div></div>
        <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Avg MPG</div><div className="text-xl font-bold">{summary.avgMpg ? summary.avgMpg.toFixed(2) : "—"}</div></div>
      </div>

      {Object.keys(summary.byState).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground mb-2">By state</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(summary.byState).sort((a, b) => b[1].gal - a[1].gal).map(([s, v]) => (
              <span key={s} className="text-[11px] rounded-md bg-muted px-2 py-0.5">{s}: {v.gal.toFixed(1)} gal · ${v.cost.toFixed(0)}</span>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <FuelForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={async (p) => {
            try {
              if (editing) await update({ data: { id: editing.id, ...p } });
              else await create({ data: p });
              qc.invalidateQueries({ queryKey: ["fuel"] });
              toast.success(editing ? "Updated" : "Added");
              setShowForm(false); setEditing(null);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No fuel purchases yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{Number(r.gallons).toFixed(2)} gal</span>
                  <span className="text-xs text-muted-foreground">@ ${Number(r.price_per_gallon).toFixed(3)}</span>
                  <span className="font-semibold">= ${Number(r.total_cost_usd).toFixed(2)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                  <span>{r.purchase_date}</span>
                  <span>· {r.state_code}</span>
                  {r.station_name && <span>· {r.station_name}</span>}
                  {r.odometer != null && <span>· {r.odometer.toLocaleString()} mi</span>}
                  {r.vehicle_unit && <span>· {r.vehicle_unit}</span>}
                </div>
                {r.notes && <div className="text-xs text-muted-foreground italic mt-0.5">"{r.notes}"</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setShowForm(true); }}>Edit</Button>
                <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete?")) del.mutate(r.id); }}><Trash2 className="size-4 text-muted-foreground" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Payload = { purchaseDate: string; stateCode: string; stationName: string | null; gallons: number; pricePerGallon: number; totalCostUsd: number; odometer: number | null; vehicleUnit: string | null; notes: string | null };

function FuelForm({ initial, onClose, onSubmit }: { initial: FuelPurchase | null; onClose: () => void; onSubmit: (p: Payload) => void | Promise<void> }) {
  const [date, setDate] = useState(initial?.purchase_date ?? new Date().toISOString().slice(0, 10));
  const [state, setState] = useState(initial?.state_code ?? "");
  const [station, setStation] = useState(initial?.station_name ?? "");
  const [gallons, setGallons] = useState(initial?.gallons?.toString() ?? "");
  const [ppg, setPpg] = useState(initial?.price_per_gallon?.toString() ?? "");
  const [odo, setOdo] = useState(initial?.odometer?.toString() ?? "");
  const [unit, setUnit] = useState(initial?.vehicle_unit ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const total = (parseFloat(gallons || "0") * parseFloat(ppg || "0"));

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">{initial ? "Edit fuel stop" : "New fuel stop"}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label className="text-xs">State (2-letter)</Label><Input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} placeholder="TX" /></div>
        <div className="sm:col-span-2"><Label className="text-xs">Station</Label><Input value={station} onChange={(e) => setStation(e.target.value)} maxLength={200} placeholder="Pilot, Loves, TA…" /></div>
        <div><Label className="text-xs">Gallons</Label><Input type="number" step="0.01" value={gallons} onChange={(e) => setGallons(e.target.value)} /></div>
        <div><Label className="text-xs">Price / gal ($)</Label><Input type="number" step="0.001" value={ppg} onChange={(e) => setPpg(e.target.value)} /></div>
        <div><Label className="text-xs">Odometer</Label><Input type="number" value={odo} onChange={(e) => setOdo(e.target.value)} /></div>
        <div><Label className="text-xs">Vehicle unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} /></div>
      </div>
      <div className="text-sm">Total: <span className="font-semibold">${total.toFixed(2)}</span></div>
      <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submitting} onClick={async () => {
          if (state.length !== 2) { toast.error("State must be 2 letters"); return; }
          if (!gallons || !ppg) { toast.error("Gallons and price required"); return; }
          setSubmitting(true);
          try {
            await onSubmit({
              purchaseDate: date, stateCode: state, stationName: station || null,
              gallons: parseFloat(gallons), pricePerGallon: parseFloat(ppg), totalCostUsd: total,
              odometer: odo ? parseInt(odo) : null, vehicleUnit: unit || null, notes: notes || null,
            });
          } finally { setSubmitting(false); }
        }}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}{initial ? "Save" : "Add"}</Button>
      </div>
    </div>
  );
}
