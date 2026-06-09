import { createFileRoute } from "@tanstack/react-router";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInspections, createInspection, deleteInspection, type Inspection, type InspectionDefect } from "@/lib/inspections.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, Plus, Trash2, AlertTriangle, CheckCircle2, Loader2, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";

export const Route = createFileRoute("/_authenticated/inspections")({
  component: InspectionsPage,
});

const CHECKLIST: { area: string; items: string[] }[] = [
  { area: "Engine", items: ["Oil level", "Coolant", "Belts & hoses", "Leaks"] },
  { area: "Brakes", items: ["Service brakes", "Parking brake", "Air lines", "Slack adjusters"] },
  { area: "Tires & Wheels", items: ["Tread depth", "Inflation", "Lug nuts", "Visible damage"] },
  { area: "Lights", items: ["Headlights", "Tail/brake lights", "Turn signals", "Reflectors"] },
  { area: "Mirrors & Glass", items: ["Mirrors", "Windshield", "Wipers"] },
  { area: "Cab", items: ["Horn", "Gauges", "Heater/defroster", "Seatbelt"] },
  { area: "Coupling", items: ["Fifth wheel", "Kingpin", "Safety chains"] },
  { area: "Trailer", items: ["Doors", "Landing gear", "Lights", "Load secured"] },
  { area: "Emergency Equipment", items: ["Fire extinguisher", "Triangles", "Spare fuses"] },
];

type Filter = "all" | "pre" | "post" | "open";

function InspectionsPage() {
  const fetchAll = useServerFn(listInspections);
  const create = useServerFn(createInspection);
  const remove = useServerFn(deleteInspection);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [fleet, setFleet] = useState<FleetFilterValue>(emptyFleetFilters);

  const { data, isLoading } = useQuery({ queryKey: ["inspections"], queryFn: () => fetchAll() });
  const items = data?.inspections ?? [];

  const filtered = useMemo(() => items.filter((i) => {
    if (filter === "pre" && i.inspection_type !== "pre") return false;
    if (filter === "post" && i.inspection_type !== "post") return false;
    if (filter === "open" && !(i.defects_correction_required && i.defects.length > 0)) return false;
    const r = i as unknown as Record<string, unknown>;
    if (fleet.truck && i.vehicle_unit !== fleet.truck) return false;
    if (fleet.driverId && r.driver_id !== fleet.driverId) return false;
    const day = i.created_at.slice(0, 10);
    if (fleet.from && day < fleet.from) return false;
    if (fleet.to && day > fleet.to) return false;
    return true;
  }), [items, filter, fleet]);

  const openCount = items.filter((i) => i.defects_correction_required && i.defects.length > 0).length;

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inspections"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
      <div className="container max-w-3xl py-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="size-6 text-primary" /> DVIR / Vehicle Inspections</h1>
            <p className="text-sm text-muted-foreground">FMCSA Pre & Post-trip Driver Vehicle Inspection Reports</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-2" /> New DVIR</Button>
        </div>

        {openCount > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4" />
            {openCount} DVIR{openCount === 1 ? "" : "s"} have defects flagged as needing correction.
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {([
            { k: "all", l: `All (${items.length})` },
            { k: "pre", l: "Pre-trip" },
            { k: "post", l: "Post-trip" },
            { k: "open", l: `Open defects (${openCount})` },
          ] as const).map(({ k, l }) => (
            <button key={k} onClick={() => setFilter(k)} className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
              filter === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}>{l}</button>
          ))}
        </div>

        {open && <NewInspectionForm onClose={() => setOpen(false)} onSubmit={async (payload) => {
          try {
            await create({ data: payload });
            qc.invalidateQueries({ queryKey: ["inspections"] });
            toast.success("DVIR saved");
            setOpen(false);
          } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
        }} />}

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {items.length === 0 ? "No DVIRs yet. Tap “New DVIR” to log a pre-trip or post-trip inspection." : "No DVIRs match this filter."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((i) => {
              const oos = i.defects.some((d) => d.severity === "out_of_service");
              return (
                <div key={i.id} className={cn("rounded-lg border p-4 space-y-2", oos ? "border-destructive/40 bg-destructive/5" : "border-border bg-card")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium capitalize flex items-center gap-2">
                        {oos ? <AlertTriangle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-success" />}
                        {i.inspection_type}-trip · {new Date(i.created_at).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {[i.vehicle_unit && `Unit ${i.vehicle_unit}`, i.trailer_unit && `Trailer ${i.trailer_unit}`, i.odometer != null && `${i.odometer.toLocaleString()} mi`].filter(Boolean).join(" · ") || "No unit details"}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => printDvir(i)}><Printer className="size-3.5 mr-1" /> Print</Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this DVIR?")) del.mutate(i.id); }} disabled={del.isPending}>
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  {i.defects.length === 0 ? (
                    <div className="text-xs text-success flex items-center gap-1.5"><CheckCircle2 className="size-3.5" /> No defects reported · Vehicle satisfactory</div>
                  ) : (
                    <div className="space-y-1">
                      {i.defects.map((d) => (
                        <div key={d.id} className="text-xs flex gap-2">
                          <span className={cn("font-medium uppercase tracking-wide text-[10px] px-1.5 rounded",
                            d.severity === "out_of_service" && "bg-destructive/20 text-destructive",
                            d.severity === "major" && "bg-warning/20 text-warning",
                            d.severity === "minor" && "bg-muted text-muted-foreground",
                          )}>{d.severity.replace("_", " ")}</span>
                          <span>{d.area} · {d.item}</span>
                          {d.note && <span className="text-muted-foreground italic">— {d.note}</span>}
                        </div>
                      ))}
                      {i.defects_correction_required && (
                        <div className="text-[11px] text-destructive font-medium mt-1">⚠ Correction required before driving</div>
                      )}
                    </div>
                  )}
                  {i.notes && <div className="text-xs text-muted-foreground italic">"{i.notes}"</div>}
                  {i.signature && <div className="text-xs text-muted-foreground">Signed: {i.signature}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
  );
}

/** Open a printable DVIR record in a new tab (FMCSA-style retention copy). */
function printDvir(i: Inspection) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { toast.error("Pop-up blocked"); return; }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const defectRows = i.defects.length === 0
    ? `<tr><td colspan="3" style="text-align:center;padding:12px;color:#0a7a23"><strong>NO DEFECTS — Vehicle condition satisfactory</strong></td></tr>`
    : i.defects.map((d) => `<tr><td>${esc(d.area)} — ${esc(d.item)}</td><td style="text-transform:capitalize;font-weight:600">${esc(d.severity.replace("_", " "))}</td><td>${esc(d.note ?? "")}</td></tr>`).join("");
  w.document.write(`<!DOCTYPE html><html><head><title>DVIR ${i.id.slice(0, 8)}</title>
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;color:#111;max-width:780px;margin:auto}
h1{font-size:22px;margin:0 0 4px}
.muted{color:#666;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
th{background:#f5f5f5;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px;font-size:13px}
.box{border:1px solid #ddd;padding:10px;border-radius:4px}
.box-label{font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.5px}
.sig{margin-top:32px;border-top:1px solid #999;padding-top:8px;font-size:12px}
@media print{body{padding:16px}}
</style></head><body>
<h1>Driver Vehicle Inspection Report</h1>
<div class="muted">${i.inspection_type === "pre" ? "Pre-Trip" : "Post-Trip"} · ${new Date(i.created_at).toLocaleString()}</div>
<div class="grid">
  <div class="box"><div class="box-label">Vehicle Unit</div><div>${esc(i.vehicle_unit ?? "—")}</div></div>
  <div class="box"><div class="box-label">Trailer Unit</div><div>${esc(i.trailer_unit ?? "—")}</div></div>
  <div class="box"><div class="box-label">Odometer</div><div>${i.odometer != null ? i.odometer.toLocaleString() + " mi" : "—"}</div></div>
</div>
<table><thead><tr><th style="width:45%">Defect</th><th style="width:20%">Severity</th><th>Notes</th></tr></thead><tbody>${defectRows}</tbody></table>
${i.defects_correction_required ? `<p style="color:#b00020;font-weight:600;margin-top:12px">⚠ Defects require correction before vehicle returns to service.</p>` : ""}
${i.notes ? `<p><strong>Notes:</strong> ${esc(i.notes)}</p>` : ""}
<div class="sig">
  <div>Driver signature: <strong>${esc(i.signature ?? "")}</strong></div>
  <div style="margin-top:24px">Mechanic signature: ______________________________ &nbsp;&nbsp; Date: ______________</div>
  <div style="margin-top:8px;color:#666;font-size:11px">FMCSA 49 CFR § 396.11 — Retain for at least 3 months</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
  w.document.close();
}

type NewPayload = {
  inspectionType: "pre" | "post";
  vehicleUnit: string | null;
  trailerUnit: string | null;
  odometer: number | null;
  defects: InspectionDefect[];
  defectsCorrectionRequired: boolean;
  signature: string | null;
  notes: string | null;
};

function NewInspectionForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (p: NewPayload) => void | Promise<void> }) {
  const [type, setType] = useState<"pre" | "post">("pre");
  const [vehicleUnit, setVehicleUnit] = useState("");
  const [trailerUnit, setTrailerUnit] = useState("");
  const [odometer, setOdometer] = useState("");
  const [signature, setSignature] = useState("");
  const [notes, setNotes] = useState("");
  const [defects, setDefects] = useState<InspectionDefect[]>([]);
  const [correctionRequired, setCorrectionRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function toggleDefect(area: string, item: string) {
    const id = `${area}:${item}`;
    setDefects((prev) => prev.some((d) => d.id === id)
      ? prev.filter((d) => d.id !== id)
      : [...prev, { id, area, item, severity: "minor", note: null }]);
  }
  function setSeverity(id: string, severity: InspectionDefect["severity"]) {
    setDefects((prev) => prev.map((d) => d.id === id ? { ...d, severity } : d));
  }
  function setNote(id: string, note: string) {
    setDefects((prev) => prev.map((d) => d.id === id ? { ...d, note } : d));
  }

  async function submit() {
    setSubmitting(true);
    try {
      await onSubmit({
        inspectionType: type,
        vehicleUnit: vehicleUnit || null,
        trailerUnit: trailerUnit || null,
        odometer: odometer ? parseInt(odometer, 10) : null,
        defects,
        defectsCorrectionRequired: correctionRequired,
        signature: signature || null,
        notes: notes || null,
      });
    } finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex gap-2">
        {(["pre", "post"] as const).map((t) => (
          <Button key={t} size="sm" variant={type === t ? "default" : "outline"} onClick={() => setType(t)} className="capitalize">{t}-trip</Button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">Vehicle #</Label><Input value={vehicleUnit} onChange={(e) => setVehicleUnit(e.target.value)} maxLength={60} /></div>
        <div><Label className="text-xs">Trailer #</Label><Input value={trailerUnit} onChange={(e) => setTrailerUnit(e.target.value)} maxLength={60} /></div>
        <div><Label className="text-xs">Odometer</Label><Input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium">Tap any item that has a defect</div>
        {CHECKLIST.map((c) => (
          <div key={c.area} className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.area}</div>
            <div className="flex flex-wrap gap-1.5">
              {c.items.map((item) => {
                const id = `${c.area}:${item}`;
                const active = defects.some((d) => d.id === id);
                return (
                  <button key={item} type="button" onClick={() => toggleDefect(c.area, item)}
                    className={cn("text-xs px-2.5 py-1 rounded-md border transition-colors",
                      active ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:bg-muted")}>
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {defects.length > 0 && (
        <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3">
          <div className="text-xs font-medium">Defects ({defects.length})</div>
          {defects.map((d) => (
            <div key={d.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium">{d.area} · {d.item}</div>
                <div className="flex gap-1">
                  {(["minor", "major", "out_of_service"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setSeverity(d.id, s)}
                      className={cn("text-[10px] px-1.5 py-0.5 rounded border capitalize",
                        d.severity === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <Input placeholder="Note (optional)" value={d.note ?? ""} onChange={(e) => setNote(d.id, e.target.value)} maxLength={500} className="h-8 text-xs" />
            </div>
          ))}
          <label className="text-xs flex items-center gap-2 pt-1">
            <input type="checkbox" checked={correctionRequired} onChange={(e) => setCorrectionRequired(e.target.checked)} />
            Defects require correction before driving
          </label>
        </div>
      )}

      <div>
        <Label className="text-xs">Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} />
      </div>
      <div>
        <Label className="text-xs">Signature (printed name)</Label>
        <Input value={signature} onChange={(e) => setSignature(e.target.value)} maxLength={120} placeholder="Driver name" />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
          Save DVIR
        </Button>
      </div>
    </div>
  );
}
