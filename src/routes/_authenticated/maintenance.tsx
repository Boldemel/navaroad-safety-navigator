import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMaintenance, createMaintenance, updateMaintenance, deleteMaintenance, type MaintRecord } from "@/lib/maintenance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Wrench, Plus, Trash2, Loader2, AlertTriangle, Calendar, Gauge } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";

export const Route = createFileRoute("/_authenticated/maintenance")({ component: MaintPage });

const SERVICE_TYPES = ["Oil Change","Tire Rotation","Tire Replacement","Brake Inspection","Brake Replacement","Annual DOT Inspection","Engine Service","Transmission","Coolant Flush","Air Filter","Fuel Filter","Greasing","Other"];

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

function MaintPage() {
  const fetchAll = useServerFn(listMaintenance);
  const create = useServerFn(createMaintenance);
  const update = useServerFn(updateMaintenance);
  const remove = useServerFn(deleteMaintenance);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<MaintRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [unitFilter, setUnitFilter] = useState<string>("");

  const { data, isLoading } = useQuery({ queryKey: ["maintenance"], queryFn: () => fetchAll() });
  const records = data?.records ?? [];
  const units = Array.from(new Set(records.map((r) => r.vehicle_unit).filter(Boolean))) as string[];
  const filtered = unitFilter ? records.filter((r) => r.vehicle_unit === unitFilter) : records;

  const upcoming = useMemo(() => {
    const items: { rec: MaintRecord; reason: string; tone: "soon" | "due" | "overdue" }[] = [];
    for (const r of records) {
      const d = daysUntil(r.next_due_date);
      if (d !== null && d <= 30) {
        items.push({ rec: r, reason: d < 0 ? `Overdue ${-d}d` : d === 0 ? "Due today" : `Due in ${d}d`, tone: d < 0 ? "overdue" : d <= 7 ? "due" : "soon" });
      }
    }
    return items.sort((a, b) => (daysUntil(a.rec.next_due_date) ?? 999) - (daysUntil(b.rec.next_due_date) ?? 999));
  }, [records]);

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); toast.success("Deleted"); },
  });

  return (
    <div className="container max-w-3xl py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="size-6 text-primary" /> Maintenance Log</h1>
          <p className="text-sm text-muted-foreground">Service history and PM reminders by unit</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4 mr-2" /> Log service</Button>
      </div>

      {upcoming.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" /> Upcoming service</div>
          {upcoming.map(({ rec, reason, tone }) => (
            <div key={rec.id} className="text-xs flex justify-between gap-2">
              <span>{rec.service_type}{rec.vehicle_unit ? ` · ${rec.vehicle_unit}` : ""}</span>
              <span className={cn("font-semibold", tone === "overdue" && "text-destructive", tone === "due" && "text-amber-600 dark:text-amber-400")}>{reason}</span>
            </div>
          ))}
        </div>
      )}

      {units.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-muted-foreground">Filter:</span>
          <button onClick={() => setUnitFilter("")} className={cn("text-xs px-2.5 py-1 rounded-full border", unitFilter === "" ? "bg-primary text-primary-foreground border-primary" : "border-border")}>All</button>
          {units.map((u) => (
            <button key={u} onClick={() => setUnitFilter(u)} className={cn("text-xs px-2.5 py-1 rounded-full border", unitFilter === u ? "bg-primary text-primary-foreground border-primary" : "border-border")}>{u}</button>
          ))}
        </div>
      )}

      {showForm && (
        <MaintForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={async (p) => {
            try {
              if (editing) await update({ data: { id: editing.id, ...p } });
              else await create({ data: p });
              qc.invalidateQueries({ queryKey: ["maintenance"] });
              toast.success(editing ? "Updated" : "Logged");
              setShowForm(false); setEditing(null);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No service records yet.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{r.service_type}{r.vehicle_unit && <span className="text-muted-foreground font-normal"> · {r.vehicle_unit}</span>}</div>
                  <div className="text-xs text-muted-foreground flex gap-3 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="size-3" /> {r.service_date}</span>
                    {r.odometer != null && <span className="flex items-center gap-1"><Gauge className="size-3" /> {r.odometer.toLocaleString()} mi</span>}
                    {r.cost_usd != null && <span>${Number(r.cost_usd).toFixed(2)}</span>}
                    {r.vendor && <span>· {r.vendor}</span>}
                  </div>
                  {(r.next_due_date || r.next_due_odometer) && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Next due: {r.next_due_date && <span>{r.next_due_date}</span>}{r.next_due_date && r.next_due_odometer ? " or " : ""}{r.next_due_odometer && <span>{r.next_due_odometer.toLocaleString()} mi</span>}
                    </div>
                  )}
                  {r.notes && <div className="text-xs text-muted-foreground italic mt-1">"{r.notes}"</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setShowForm(true); }}>Edit</Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete?")) del.mutate(r.id); }}><Trash2 className="size-4 text-muted-foreground" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type MaintPayload = {
  vehicleUnit: string | null; serviceType: string; serviceDate: string;
  odometer: number | null; costUsd: number | null; vendor: string | null; notes: string | null;
  nextDueDate: string | null; nextDueOdometer: number | null;
};

function MaintForm({ initial, onClose, onSubmit }: { initial: MaintRecord | null; onClose: () => void; onSubmit: (p: MaintPayload) => void | Promise<void> }) {
  const [unit, setUnit] = useState(initial?.vehicle_unit ?? "");
  const [type, setType] = useState(initial?.service_type ?? "Oil Change");
  const [date, setDate] = useState(initial?.service_date ?? new Date().toISOString().slice(0, 10));
  const [odo, setOdo] = useState(initial?.odometer?.toString() ?? "");
  const [cost, setCost] = useState(initial?.cost_usd?.toString() ?? "");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [nextDate, setNextDate] = useState(initial?.next_due_date ?? "");
  const [nextOdo, setNextOdo] = useState(initial?.next_due_odometer?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">{initial ? "Edit service" : "Log new service"}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Service type</Label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Vehicle unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. Truck 24" maxLength={40} /></div>
        <div><Label className="text-xs">Service date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label className="text-xs">Odometer</Label><Input type="number" value={odo} onChange={(e) => setOdo(e.target.value)} /></div>
        <div><Label className="text-xs">Cost ($)</Label><Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        <div><Label className="text-xs">Vendor</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={200} /></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 pt-1 border-t border-border">
        <div><Label className="text-xs">Next due date</Label><Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></div>
        <div><Label className="text-xs">Next due odometer</Label><Input type="number" value={nextOdo} onChange={(e) => setNextOdo(e.target.value)} /></div>
      </div>
      <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submitting} onClick={async () => {
          setSubmitting(true);
          try {
            await onSubmit({
              vehicleUnit: unit || null, serviceType: type, serviceDate: date,
              odometer: odo ? parseInt(odo) : null, costUsd: cost ? parseFloat(cost) : null,
              vendor: vendor || null, notes: notes || null,
              nextDueDate: nextDate || null, nextDueOdometer: nextOdo ? parseInt(nextOdo) : null,
            });
          } finally { setSubmitting(false); }
        }}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}{initial ? "Save" : "Log service"}</Button>
      </div>
    </div>
  );
}
