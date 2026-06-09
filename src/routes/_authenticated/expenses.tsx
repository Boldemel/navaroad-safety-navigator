import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listExpenses, createExpense, updateExpense, deleteExpense, EXPENSE_CATEGORIES, type Expense } from "@/lib/expenses.functions";
import { listSettlements, createSettlement, updateSettlement, deleteSettlement, type Settlement } from "@/lib/settlements.functions";
import { listLoads, type Load } from "@/lib/loads.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Receipt, Plus, Trash2, Loader2, Download, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";

export const Route = createFileRoute("/_authenticated/expenses")({ component: ExpensesPage });

type Tab = "expenses" | "earnings";

function ExpensesPage() {
  const [tab, setTab] = useState<Tab>("expenses");
  const [filters, setFilters] = useState<FleetFilterValue>(emptyFleetFilters);
  const { truck, driverId, from, to } = filters;

  const fetchExpenses = useServerFn(listExpenses);
  const fetchSettlements = useServerFn(listSettlements);
  const { data: expData } = useQuery({ queryKey: ["expenses"], queryFn: () => fetchExpenses() });
  const { data: setData } = useQuery({ queryKey: ["settlements"], queryFn: () => fetchSettlements() });
  const allExp = expData?.expenses ?? [];
  const allSet = setData?.settlements ?? [];

  const filtExp = useMemo(() => allExp.filter((e) => {
    const r = e as unknown as Record<string, unknown>;
    if (from && e.expense_date < from) return false;
    if (to && e.expense_date > to) return false;
    if (truck && r.vehicle_unit !== truck) return false;
    if (driverId && r.driver_id !== driverId) return false;
    return true;
  }), [allExp, from, to, truck, driverId]);
  const filtSet = useMemo(() => allSet.filter((s) => {
    const r = s as unknown as Record<string, unknown>;
    if (from && s.settlement_date < from) return false;
    if (to && s.settlement_date > to) return false;
    if (truck && r.vehicle_unit !== truck) return false;
    if (driverId && r.driver_id !== driverId) return false;
    return true;
  }), [allSet, from, to, truck, driverId]);

  const expTotal = filtExp.reduce((a, e) => a + Number(e.amount_usd || 0), 0);
  const gross = filtSet.reduce((a, s) => a + Number(s.gross_pay_usd || 0), 0);
  const deductions = filtSet.reduce((a, s) => a + Number(s.deductions_usd || 0), 0);
  const settlementNet = gross - deductions;
  const finalNet = settlementNet - expTotal;
  const totalMiles = filtSet.reduce((a, s) => a + Number(s.miles || 0), 0);
  const rpm = totalMiles > 0 ? gross / totalMiles : 0;

  return (
    <div className="container max-w-3xl py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="size-6 text-primary" /> Expenses & Earnings</h1>
        <p className="text-sm text-muted-foreground">Track deductible expenses and per-load settlements</p>
      </div>

      <FleetFilters value={filters} onChange={setFilters} />

      {/* Net income summary */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Net Income {from || to ? `(${from || "…"} → ${to || "…"})` : "(all time)"}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Gross pay" value={`$${gross.toFixed(2)}`} icon={<TrendingUp className="size-3.5 text-green-500" />} />
          <Stat label="Deductions" value={`-$${deductions.toFixed(2)}`} icon={<TrendingDown className="size-3.5 text-amber-500" />} />
          <Stat label="Expenses" value={`-$${expTotal.toFixed(2)}`} icon={<TrendingDown className="size-3.5 text-red-500" />} />
          <Stat label="Net" value={`$${finalNet.toFixed(2)}`} icon={<DollarSign className={cn("size-3.5", finalNet >= 0 ? "text-green-500" : "text-red-500")} />} highlight />
        </div>
        {totalMiles > 0 && (
          <div className="text-xs text-muted-foreground">
            {totalMiles.toLocaleString()} mi · avg ${rpm.toFixed(2)}/mi gross
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["expenses", "earnings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "expenses"
        ? <ExpensesTab items={filtExp} total={expTotal} />
        : <EarningsTab items={filtSet} />}
    </div>
  );
}

function Stat({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md p-2", highlight && "bg-primary/10 border border-primary/30")}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className={cn("font-bold", highlight ? "text-base" : "text-sm")}>{value}</div>
    </div>
  );
}

/* ---------------- EXPENSES TAB ---------------- */
function ExpensesTab({ items, total }: { items: Expense[]; total: number }) {
  const create = useServerFn(createExpense);
  const update = useServerFn(updateExpense);
  const remove = useServerFn(deleteExpense);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [catFilter, setCatFilter] = useState<string>("");

  const view = useMemo(() => items.filter((e) => !catFilter || e.category === catFilter), [items, catFilter]);

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("Deleted"); },
  });

  function exportCsv() {
    const rows = [["Date","Category","Amount","Vendor","State","Notes"]];
    for (const e of view) rows.push([e.expense_date, e.category, Number(e.amount_usd).toFixed(2), e.vendor ?? "", e.state_code ?? "", (e.notes ?? "").replace(/\n/g, " ")]);
    rows.push([]); rows.push(["TOTAL", "", total.toFixed(2), "", "", ""]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Label className="text-xs">Category filter</Label>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!view.length}><Download className="size-4 mr-2" /> CSV</Button>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4 mr-2" /> Add</Button>
        </div>
      </div>

      {showForm && (
        <ExpenseForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={async (p) => {
            try {
              if (editing) await update({ data: { id: editing.id, ...p } });
              else await create({ data: p });
              qc.invalidateQueries({ queryKey: ["expenses"] });
              toast.success(editing ? "Updated" : "Added");
              setShowForm(false); setEditing(null);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}
        />
      )}

      {view.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No expenses in range.</div>
      ) : (
        <div className="space-y-2">
          {view.map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-card p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-primary/15 text-primary">{e.category}</span>
                  <span className="font-semibold">${Number(e.amount_usd).toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">{e.expense_date}</span>
                  {e.state_code && <span className="text-xs text-muted-foreground">· {e.state_code}</span>}
                </div>
                {e.vendor && <div className="text-xs text-muted-foreground mt-0.5">{e.vendor}</div>}
                {e.notes && <div className="text-xs text-muted-foreground italic mt-0.5">"{e.notes}"</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(e); setShowForm(true); }}>Edit</Button>
                <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete?")) del.mutate(e.id); }}><Trash2 className="size-4 text-muted-foreground" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ExpensePayload = { expenseDate: string; category: typeof EXPENSE_CATEGORIES[number]; amountUsd: number; vendor: string | null; stateCode: string | null; notes: string | null };

function ExpenseForm({ initial, onClose, onSubmit }: { initial: Expense | null; onClose: () => void; onSubmit: (p: ExpensePayload) => void | Promise<void> }) {
  const [date, setDate] = useState(initial?.expense_date ?? new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState<typeof EXPENSE_CATEGORIES[number]>((initial?.category as typeof EXPENSE_CATEGORIES[number]) ?? "Fuel");
  const [amount, setAmount] = useState(initial?.amount_usd?.toString() ?? "");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [state, setState] = useState(initial?.state_code ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">{initial ? "Edit expense" : "New expense"}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div>
          <Label className="text-xs">Category</Label>
          <select value={cat} onChange={(e) => setCat(e.target.value as typeof EXPENSE_CATEGORIES[number])} className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Amount ($)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label className="text-xs">Vendor</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={200} /></div>
        <div><Label className="text-xs">State (2-letter)</Label><Input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} placeholder="TX" /></div>
      </div>
      <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submitting} onClick={async () => {
          if (!amount) { toast.error("Amount required"); return; }
          if (state && state.length !== 2) { toast.error("State must be 2 letters"); return; }
          setSubmitting(true);
          try {
            await onSubmit({ expenseDate: date, category: cat, amountUsd: parseFloat(amount), vendor: vendor || null, stateCode: state || null, notes: notes || null });
          } finally { setSubmitting(false); }
        }}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}{initial ? "Save" : "Add"}</Button>
      </div>
    </div>
  );
}

/* ---------------- EARNINGS TAB ---------------- */
function EarningsTab({ items }: { items: Settlement[] }) {
  const create = useServerFn(createSettlement);
  const update = useServerFn(updateSettlement);
  const remove = useServerFn(deleteSettlement);
  const fetchLoads = useServerFn(listLoads);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Settlement | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { data: loadsData } = useQuery({ queryKey: ["loads"], queryFn: () => fetchLoads() });
  const loads = loadsData?.loads ?? [];

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settlements"] }); toast.success("Deleted"); },
  });

  function exportCsv() {
    const rows = [["Date","Payer","Ref","Gross","Deductions","Net","Miles","RPM","Notes"]];
    for (const s of items) {
      const net = Number(s.gross_pay_usd) - Number(s.deductions_usd);
      rows.push([
        s.settlement_date, s.payer ?? "", s.reference_number ?? "",
        Number(s.gross_pay_usd).toFixed(2), Number(s.deductions_usd).toFixed(2), net.toFixed(2),
        s.miles?.toString() ?? "", s.rate_per_mile?.toFixed(2) ?? "",
        (s.notes ?? "").replace(/\n/g, " "),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `settlements-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!items.length}><Download className="size-4 mr-2" /> CSV</Button>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4 mr-2" /> Add settlement</Button>
      </div>

      {showForm && (
        <SettlementForm
          initial={editing}
          loads={loads}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={async (p) => {
            try {
              if (editing) await update({ data: { id: editing.id, ...p } });
              else await create({ data: p });
              qc.invalidateQueries({ queryKey: ["settlements"] });
              toast.success(editing ? "Updated" : "Added");
              setShowForm(false); setEditing(null);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}
        />
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No settlements yet. Add one per load or per pay period.</div>
      ) : (
        <div className="space-y-2">
          {items.map((s) => {
            const net = Number(s.gross_pay_usd) - Number(s.deductions_usd);
            const load = loads.find((l) => l.id === s.load_id);
            return (
              <div key={s.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-green-500">${net.toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground">{s.settlement_date}</span>
                      {s.payer && <span className="text-xs text-muted-foreground">· {s.payer}</span>}
                      {s.reference_number && <span className="text-[10px] text-muted-foreground font-mono">#{s.reference_number}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Gross ${Number(s.gross_pay_usd).toFixed(2)} − Deductions ${Number(s.deductions_usd).toFixed(2)}
                      {s.miles && ` · ${s.miles} mi`}
                      {s.rate_per_mile && ` @ $${Number(s.rate_per_mile).toFixed(2)}/mi`}
                    </div>
                    {load && <div className="text-xs text-muted-foreground">Load: {load.commodity ?? load.bol_number ?? "—"}</div>}
                    {s.notes && <div className="text-xs text-muted-foreground italic">"{s.notes}"</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(s); setShowForm(true); }}>Edit</Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete?")) del.mutate(s.id); }}><Trash2 className="size-4 text-muted-foreground" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type SettlementPayload = {
  loadId: string | null;
  settlementDate: string;
  grossPayUsd: number;
  miles: number | null;
  ratePerMile: number | null;
  deductionsUsd: number;
  deductionNotes: string | null;
  payer: string | null;
  referenceNumber: string | null;
  notes: string | null;
};

function SettlementForm({ initial, loads, onClose, onSubmit }: { initial: Settlement | null; loads: Load[]; onClose: () => void; onSubmit: (p: SettlementPayload) => void | Promise<void> }) {
  const [date, setDate] = useState(initial?.settlement_date ?? new Date().toISOString().slice(0, 10));
  const [loadId, setLoadId] = useState(initial?.load_id ?? "");
  const [gross, setGross] = useState(initial?.gross_pay_usd?.toString() ?? "");
  const [miles, setMiles] = useState(initial?.miles?.toString() ?? "");
  const [rpm, setRpm] = useState(initial?.rate_per_mile?.toString() ?? "");
  const [ded, setDed] = useState(initial?.deductions_usd?.toString() ?? "0");
  const [dedNotes, setDedNotes] = useState(initial?.deduction_notes ?? "");
  const [payer, setPayer] = useState(initial?.payer ?? "");
  const [ref, setRef] = useState(initial?.reference_number ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Auto-compute gross from miles × RPM if both present and gross empty
  function onMilesChange(v: string) {
    setMiles(v);
    if (rpm && v && !gross) setGross((parseFloat(v) * parseFloat(rpm)).toFixed(2));
  }
  function onRpmChange(v: string) {
    setRpm(v);
    if (miles && v && !gross) setGross((parseFloat(miles) * parseFloat(v)).toFixed(2));
  }

  const net = (parseFloat(gross || "0") - parseFloat(ded || "0")) || 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">{initial ? "Edit settlement" : "New settlement"}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div><Label className="text-xs">Settlement date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div>
          <Label className="text-xs">Load (optional)</Label>
          <select value={loadId} onChange={(e) => setLoadId(e.target.value)} className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">—</option>
            {loads.map((l) => <option key={l.id} value={l.id}>{l.commodity ?? l.bol_number ?? l.id.slice(0, 8)}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Payer (broker/carrier)</Label><Input value={payer} onChange={(e) => setPayer(e.target.value)} maxLength={200} /></div>
        <div><Label className="text-xs">Reference #</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} /></div>
        <div><Label className="text-xs">Miles</Label><Input type="number" value={miles} onChange={(e) => onMilesChange(e.target.value)} /></div>
        <div><Label className="text-xs">$/mile</Label><Input type="number" step="0.01" value={rpm} onChange={(e) => onRpmChange(e.target.value)} /></div>
        <div><Label className="text-xs">Gross pay ($)</Label><Input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} /></div>
        <div><Label className="text-xs">Deductions ($)</Label><Input type="number" step="0.01" value={ded} onChange={(e) => setDed(e.target.value)} /></div>
      </div>
      <div><Label className="text-xs">Deduction notes</Label><Input value={dedNotes} onChange={(e) => setDedNotes(e.target.value)} maxLength={2000} placeholder="dispatch fee, fuel advance, escrow…" /></div>
      <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} /></div>

      <div className="rounded-md bg-muted p-2 text-sm flex justify-between">
        <span className="text-muted-foreground">Net</span>
        <span className={cn("font-bold", net >= 0 ? "text-green-500" : "text-red-500")}>${net.toFixed(2)}</span>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submitting} onClick={async () => {
          if (!gross) { toast.error("Gross pay required"); return; }
          setSubmitting(true);
          try {
            await onSubmit({
              loadId: loadId || null,
              settlementDate: date,
              grossPayUsd: parseFloat(gross),
              miles: miles ? parseFloat(miles) : null,
              ratePerMile: rpm ? parseFloat(rpm) : null,
              deductionsUsd: parseFloat(ded || "0"),
              deductionNotes: dedNotes || null,
              payer: payer || null,
              referenceNumber: ref || null,
              notes: notes || null,
            });
          } finally { setSubmitting(false); }
        }}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}{initial ? "Save" : "Add"}</Button>
      </div>
    </div>
  );
}
