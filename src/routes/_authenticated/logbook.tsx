import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDutyLogs, createDutyLog, updateDutyLog, deleteDutyLog, type DutyLog, type DutyStatus } from "@/lib/logbook.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus, Trash2, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { PageTabs } from "@/components/page-tabs";

const LOGBOOK_TABS = [
  { to: "/logbook", label: "Logbook Grid", icon: ClipboardList },
  { to: "/hos", label: "HOS Limits", icon: Clock },
];
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/logbook")({ component: LogbookPage });

const STATUSES: { key: DutyStatus; label: string; row: number; color: string }[] = [
  { key: "off", label: "Off Duty", row: 0, color: "bg-slate-400" },
  { key: "sleeper", label: "Sleeper", row: 1, color: "bg-blue-500" },
  { key: "driving", label: "Driving", row: 2, color: "bg-emerald-500" },
  { key: "onduty", label: "On Duty", row: 3, color: "bg-amber-500" },
];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }

function LogbookPage() {
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const dayStart = startOfDay(date);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const fetchAll = useServerFn(listDutyLogs);
  const create = useServerFn(createDutyLog);
  const update = useServerFn(updateDutyLog);
  const remove = useServerFn(deleteDutyLog);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DutyLog | null>(null);
  const [showForm, setShowForm] = useState(false);

  // pull a wider window to catch entries crossing midnight
  const winFrom = new Date(dayStart.getTime() - 86_400_000).toISOString();
  const winTo = new Date(dayEnd.getTime() + 86_400_000).toISOString();
  const { data, isLoading } = useQuery({
    queryKey: ["duty", fmtDate(date)],
    queryFn: () => fetchAll({ data: { fromIso: winFrom, toIso: winTo } }),
  });
  const logs = data?.logs ?? [];

  // Build segments clipped to today
  const segments = useMemo(() => {
    const out: { status: DutyStatus; start: number; end: number; log: DutyLog }[] = [];
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayEnd.getTime();
    const sorted = [...logs].sort((a, b) => a.started_at.localeCompare(b.started_at));
    for (let i = 0; i < sorted.length; i++) {
      const l = sorted[i];
      const s = new Date(l.started_at).getTime();
      const e = l.ended_at
        ? new Date(l.ended_at).getTime()
        : (sorted[i + 1] ? new Date(sorted[i + 1].started_at).getTime() : Date.now());
      const clipS = Math.max(s, dayStartMs);
      const clipE = Math.min(e, dayEndMs);
      if (clipE > clipS) out.push({ status: l.status, start: clipS - dayStartMs, end: clipE - dayStartMs, log: l });
    }
    return out;
  }, [logs, dayStart, dayEnd]);

  const totals = useMemo(() => {
    const t: Record<DutyStatus, number> = { off: 0, sleeper: 0, driving: 0, onduty: 0 };
    for (const s of segments) t[s.status] += (s.end - s.start);
    return t;
  }, [segments]);

  const driveHrs = totals.driving / 3_600_000;
  const onDutyHrs = (totals.driving + totals.onduty) / 3_600_000;
  const violations: string[] = [];
  if (driveHrs > 11) violations.push(`Drive time ${driveHrs.toFixed(1)}h exceeds 11h limit`);
  if (onDutyHrs > 14) violations.push(`On-duty window ${onDutyHrs.toFixed(1)}h exceeds 14h limit`);

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["duty"] }); toast.success("Deleted"); },
  });

  function shiftDay(days: number) { setDate(new Date(date.getTime() + days * 86_400_000)); }

  return (
    <div className="container max-w-5xl py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="size-6 text-primary" /> Logbook</h1>
          <p className="text-sm text-muted-foreground">ELD-style duty status grid · 15-min blocks</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftDay(-1)}><ChevronLeft className="size-4" /></Button>
          <Input type="date" value={fmtDate(date)} onChange={(e) => setDate(startOfDay(new Date(e.target.value + "T00:00:00")))} className="h-9 w-auto" />
          <Button variant="outline" size="icon" onClick={() => shiftDay(1)} disabled={fmtDate(date) >= fmtDate(new Date())}><ChevronRight className="size-4" /></Button>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4 mr-2" /> Entry</Button>
        </div>
      </div>

      {violations.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-1">
          {violations.map((v) => (
            <div key={v} className="text-xs flex items-center gap-2 text-destructive font-medium"><AlertTriangle className="size-4" /> {v}</div>
          ))}
        </div>
      )}

      <DutyGrid segments={segments} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STATUSES.map((s) => (
          <div key={s.key} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={cn("size-2.5 rounded-sm", s.color)} /> {s.label}</div>
            <div className="text-lg font-bold mt-1">{(totals[s.key] / 3_600_000).toFixed(2)}h</div>
          </div>
        ))}
      </div>

      {showForm && (
        <DutyForm
          initial={editing}
          defaultDate={date}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={async (p) => {
            try {
              if (editing) await update({ data: { id: editing.id, ...p } });
              else await create({ data: p });
              qc.invalidateQueries({ queryKey: ["duty"] });
              toast.success(editing ? "Updated" : "Added");
              setShowForm(false); setEditing(null);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}
        />
      )}

      <div className="space-y-2">
        <div className="text-sm font-medium">Entries</div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No entries.</div>
        ) : logs.map((l) => {
          const s = STATUSES.find((x) => x.key === l.status)!;
          return (
            <div key={l.id} className="rounded-lg border border-border bg-card p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("size-2.5 rounded-sm", s.color)} />
                  <span className="font-semibold text-sm">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{new Date(l.started_at).toLocaleString()} → {l.ended_at ? new Date(l.ended_at).toLocaleTimeString() : "ongoing"}</span>
                </div>
                {l.location && <div className="text-xs text-muted-foreground mt-0.5">📍 {l.location}</div>}
                {l.notes && <div className="text-xs text-muted-foreground italic mt-0.5">"{l.notes}"</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(l); setShowForm(true); }}>Edit</Button>
                <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete?")) del.mutate(l.id); }}><Trash2 className="size-4 text-muted-foreground" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DutyGrid({ segments }: { segments: { status: DutyStatus; start: number; end: number }[] }) {
  const DAY = 86_400_000;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="grid grid-cols-[80px_1fr] gap-1">
        <div /> 
        <div className="flex justify-between text-[9px] text-muted-foreground px-0.5">
          {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => <span key={h}>{h.toString().padStart(2, "0")}</span>)}
        </div>
        {STATUSES.map((s) => (
          <div key={s.key} className="contents">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 pr-2">
              <span className={cn("size-2 rounded-sm", s.color)} />
              <span className="truncate">{s.label}</span>
            </div>
            <div className="relative h-7 rounded bg-muted/40 border border-border overflow-hidden">
              {/* 4-hour gridlines */}
              {Array.from({ length: 5 }, (_, i) => (i + 1) * 4).filter((h) => h < 24).map((h) => (
                <div key={h} className="absolute top-0 bottom-0 border-l border-border/60" style={{ left: `${(h / 24) * 100}%` }} />
              ))}
              {segments.filter((seg) => seg.status === s.key).map((seg, i) => (
                <div key={i} className={cn("absolute top-0.5 bottom-0.5 rounded-sm", s.color, "opacity-90")}
                  style={{ left: `${(seg.start / DAY) * 100}%`, width: `${((seg.end - seg.start) / DAY) * 100}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Payload = { status: DutyStatus; startedAt: string; endedAt: string | null; location: string | null; vehicleUnit: string | null; notes: string | null };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string { return new Date(v).toISOString(); }

function DutyForm({ initial, defaultDate, onClose, onSubmit }: { initial: DutyLog | null; defaultDate: Date; onClose: () => void; onSubmit: (p: Payload) => void | Promise<void> }) {
  const [status, setStatus] = useState<DutyStatus>(initial?.status ?? "off");
  const [startVal, setStartVal] = useState(initial ? toLocalInput(initial.started_at) : toLocalInput(new Date(defaultDate.getTime() + 8 * 3_600_000).toISOString()));
  const [endVal, setEndVal] = useState(initial?.ended_at ? toLocalInput(initial.ended_at) : "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [unit, setUnit] = useState(initial?.vehicle_unit ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">{initial ? "Edit entry" : "New duty entry"}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STATUSES.map((s) => (
          <button key={s.key} type="button" onClick={() => setStatus(s.key)}
            className={cn("rounded-md border p-2 text-xs font-medium transition-colors", status === s.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            <span className={cn("inline-block size-2 rounded-sm mr-1.5 align-middle", s.color)} />{s.label}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div><Label className="text-xs">Start</Label><Input type="datetime-local" value={startVal} onChange={(e) => setStartVal(e.target.value)} /></div>
        <div><Label className="text-xs">End (optional)</Label><Input type="datetime-local" value={endVal} onChange={(e) => setEndVal(e.target.value)} /></div>
        <div><Label className="text-xs">Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} /></div>
        <div><Label className="text-xs">Vehicle unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} /></div>
      </div>
      <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submitting} onClick={async () => {
          if (!startVal) { toast.error("Start time required"); return; }
          setSubmitting(true);
          try {
            await onSubmit({
              status, startedAt: fromLocalInput(startVal),
              endedAt: endVal ? fromLocalInput(endVal) : null,
              location: location || null, vehicleUnit: unit || null, notes: notes || null,
            });
          } finally { setSubmitting(false); }
        }}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}{initial ? "Save" : "Add"}</Button>
      </div>
    </div>
  );
}
