import { createFileRoute } from "@tanstack/react-router";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLoads, createLoad, updateLoad, deleteLoad, type Load } from "@/lib/loads.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Package, Plus, Trash2, MapPin, Calendar, AlertTriangle, Loader2, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/loads/")({
  component: LoadsPage,
});

function fmtDate(s: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
function hoursUntil(s: string | null): number | null {
  if (!s) return null;
  return (new Date(s).getTime() - Date.now()) / 3_600_000;
}

function LoadsPage() {
  const fetchAll = useServerFn(listLoads);
  const create = useServerFn(createLoad);
  const update = useServerFn(updateLoad);
  const remove = useServerFn(deleteLoad);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Load | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["loads"], queryFn: () => fetchAll() });
  const loads = data?.loads ?? [];
  const current = loads.find((l) => l.is_current) ?? null;
  const others = loads.filter((l) => !l.is_current);

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loads"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const setCurrent = useMutation({
    mutationFn: async (l: Load) => update({ data: {
      id: l.id,
      status: l.status,
      bolNumber: l.bol_number,
      commodity: l.commodity,
      weightLbs: l.weight_lbs,
      shipperName: l.shipper_name,
      shipperAddress: l.shipper_address,
      consigneeName: l.consignee_name,
      consigneeAddress: l.consignee_address,
      pickupAt: l.pickup_at,
      deliveryAt: l.delivery_at,
      rateUsd: l.rate_usd,
      notes: l.notes,
      isCurrent: true,
      loadedMiles: l.loaded_miles,
      emptyMiles: l.empty_miles,
      totalMiles: l.total_miles,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loads"] }); toast.success("Marked as current"); },
  });

  return (
      <div className="container max-w-3xl py-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="size-6 text-primary" /> Loads</h1>
            <p className="text-sm text-muted-foreground">Track current load and appointments</p>
          </div>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4 mr-2" /> New load</Button>
        </div>

        {showForm && (
          <LoadForm
            initial={editing}
            onClose={() => { setShowForm(false); setEditing(null); }}
            onSubmit={async (payload) => {
              try {
                if (editing) await update({ data: { id: editing.id, ...payload } });
                else await create({ data: payload });
                qc.invalidateQueries({ queryKey: ["loads"] });
                toast.success(editing ? "Load updated" : "Load created");
                setShowForm(false); setEditing(null);
              } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            }}
          />
        )}

        {current && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
              <Star className="size-3.5 fill-primary" /> Current Load
            </div>
            <LoadCard load={current} onEdit={() => { setEditing(current); setShowForm(true); }} onDelete={() => { if (confirm("Delete?")) del.mutate(current.id); }} />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : others.length === 0 && !current ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No loads yet. Tap “New load” to add one.
          </div>
        ) : (
          others.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Other loads</div>
              {others.map((l) => (
                <div key={l.id} className="rounded-lg border border-border bg-card p-4">
                  <LoadCard load={l} onEdit={() => { setEditing(l); setShowForm(true); }} onDelete={() => { if (confirm("Delete?")) del.mutate(l.id); }} onMakeCurrent={() => setCurrent.mutate(l)} />
                </div>
              ))}
            </div>
          )
        )}
      </div>
  );
}

function LoadCard({ load, onEdit, onDelete, onMakeCurrent }: { load: Load; onEdit: () => void; onDelete: () => void; onMakeCurrent?: () => void }) {
  const deliveryIn = hoursUntil(load.delivery_at);
  const lateRisk = deliveryIn != null && deliveryIn < 6 && load.status !== "delivered";
  const hasMiles = load.loaded_miles != null || load.empty_miles != null || load.total_miles != null;
  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{load.commodity || "Untitled load"}</div>
          <div className="text-xs text-muted-foreground capitalize">{load.status.replace("_", " ")}{load.bol_number ? ` · BOL ${load.bol_number}` : ""}{load.weight_lbs ? ` · ${load.weight_lbs.toLocaleString()} lbs` : ""}</div>
        </div>
        <div className="flex gap-1">
          {onMakeCurrent && <Button variant="ghost" size="sm" onClick={onMakeCurrent}><Star className="size-3.5 mr-1" /> Current</Button>}
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
          <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="size-4 text-muted-foreground" /></Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-medium"><MapPin className="size-3.5 text-muted-foreground" /> Pickup</div>
          {load.shipper_name && <div>{load.shipper_name}</div>}
          {load.shipper_address && <div className="text-muted-foreground">{load.shipper_address}</div>}
          {load.pickup_at && <div className="flex items-center gap-1 text-muted-foreground"><Calendar className="size-3" /> {fmtDate(load.pickup_at)}</div>}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-medium"><MapPin className="size-3.5 text-muted-foreground" /> Destination</div>
          {load.consignee_name && <div>{load.consignee_name}</div>}
          {load.consignee_address && <div className="text-muted-foreground">{load.consignee_address}</div>}
          {load.delivery_at && <div className="flex items-center gap-1 text-muted-foreground"><Calendar className="size-3" /> {fmtDate(load.delivery_at)}</div>}
        </div>
      </div>

      {hasMiles && (
        <div className="flex flex-wrap gap-3 text-xs">
          {load.loaded_miles != null && (
            <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1">
              <span className="text-muted-foreground">Loaded</span>{" "}
              <span className="font-semibold">{load.loaded_miles.toLocaleString()} mi</span>
            </div>
          )}
          {load.empty_miles != null && (
            <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1">
              <span className="text-muted-foreground">Empty</span>{" "}
              <span className="font-semibold">{load.empty_miles.toLocaleString()} mi</span>
            </div>
          )}
          {load.total_miles != null && (
            <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1">
              <span className="text-muted-foreground">Total</span>{" "}
              <span className="font-semibold">{load.total_miles.toLocaleString()} mi</span>
            </div>
          )}
        </div>
      )}

      {lateRisk && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="size-3.5" />
          Delivery in {deliveryIn! < 0 ? "PAST DUE" : `${deliveryIn!.toFixed(1)}h`} — keep an eye on ETA.
        </div>
      )}

      {load.notes && <div className="text-xs text-muted-foreground italic">"{load.notes}"</div>}
      {load.rate_usd && <div className="text-xs text-muted-foreground">Rate: ${load.rate_usd.toFixed(2)}</div>}
    </div>
  );
}

type LoadPayload = {
  status: "planned" | "in_transit" | "delivered" | "cancelled";
  bolNumber: string | null;
  commodity: string | null;
  weightLbs: number | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  pickupAt: string | null;
  deliveryAt: string | null;
  rateUsd: number | null;
  notes: string | null;
  isCurrent: boolean;
  loadedMiles: number | null;
  emptyMiles: number | null;
  totalMiles: number | null;
};

function toLocalInputValue(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LoadForm({ initial, onClose, onSubmit }: { initial: Load | null; onClose: () => void; onSubmit: (p: LoadPayload) => void | Promise<void> }) {
  const [status, setStatus] = useState<LoadPayload["status"]>(initial?.status ?? "planned");
  const [bol, setBol] = useState(initial?.bol_number ?? "");
  const [commodity, setCommodity] = useState(initial?.commodity ?? "");
  const [weight, setWeight] = useState(initial?.weight_lbs?.toString() ?? "");
  const [shipName, setShipName] = useState(initial?.shipper_name ?? "");
  const [shipAddr, setShipAddr] = useState(initial?.shipper_address ?? "");
  const [consName, setConsName] = useState(initial?.consignee_name ?? "");
  const [consAddr, setConsAddr] = useState(initial?.consignee_address ?? "");
  const [pickupAt, setPickupAt] = useState(toLocalInputValue(initial?.pickup_at ?? null));
  const [deliveryAt, setDeliveryAt] = useState(toLocalInputValue(initial?.delivery_at ?? null));
  const [rate, setRate] = useState(initial?.rate_usd?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isCurrent, setIsCurrent] = useState(initial?.is_current ?? false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await onSubmit({
        status,
        bolNumber: bol || null,
        commodity: commodity || null,
        weightLbs: weight ? parseFloat(weight) : null,
        shipperName: shipName || null,
        shipperAddress: shipAddr || null,
        consigneeName: consName || null,
        consigneeAddress: consAddr || null,
        pickupAt: pickupAt ? new Date(pickupAt).toISOString() : null,
        deliveryAt: deliveryAt ? new Date(deliveryAt).toISOString() : null,
        rateUsd: rate ? parseFloat(rate) : null,
        notes: notes || null,
        isCurrent,
      });
    } finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">{initial ? "Edit load" : "New load"}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div><Label className="text-xs">Commodity</Label><Input value={commodity} onChange={(e) => setCommodity(e.target.value)} maxLength={200} placeholder="e.g. Frozen produce" /></div>
        <div><Label className="text-xs">BOL #</Label><Input value={bol} onChange={(e) => setBol(e.target.value)} maxLength={80} /></div>
        <div><Label className="text-xs">Weight (lbs)</Label><Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
        <div>
          <Label className="text-xs">Status</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value as LoadPayload["status"])} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="planned">Planned</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 pt-1">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shipper</div>
          <Input value={shipName} onChange={(e) => setShipName(e.target.value)} placeholder="Name" maxLength={200} />
          <Input value={shipAddr} onChange={(e) => setShipAddr(e.target.value)} placeholder="Address" maxLength={400} />
          <div><Label className="text-xs">Pickup appointment</Label><Input type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Consignee</div>
          <Input value={consName} onChange={(e) => setConsName(e.target.value)} placeholder="Name" maxLength={200} />
          <Input value={consAddr} onChange={(e) => setConsAddr(e.target.value)} placeholder="Address" maxLength={400} />
          <div><Label className="text-xs">Delivery appointment</Label><Input type="datetime-local" value={deliveryAt} onChange={(e) => setDeliveryAt(e.target.value)} /></div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <div><Label className="text-xs">Rate ($)</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        <div className="flex items-end">
          <label className="text-sm flex items-center gap-2 h-9">
            <input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} />
            Mark as current load
          </label>
        </div>
      </div>

      <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} /></div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
          {initial ? "Save changes" : "Create load"}
        </Button>
      </div>
    </div>
  );
}
