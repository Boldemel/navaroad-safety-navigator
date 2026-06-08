import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listExpenses, createExpense, updateExpense, deleteExpense, EXPENSE_CATEGORIES, type Expense } from "@/lib/expenses.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Receipt, Plus, Trash2, Loader2, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/expenses")({ component: ExpensesPage });

function ExpensesPage() {
  const fetchAll = useServerFn(listExpenses);
  const create = useServerFn(createExpense);
  const update = useServerFn(updateExpense);
  const remove = useServerFn(deleteExpense);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [catFilter, setCatFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { data, isLoading } = useQuery({ queryKey: ["expenses"], queryFn: () => fetchAll() });
  const all = data?.expenses ?? [];

  const filtered = useMemo(() => all.filter((e) => {
    if (catFilter && e.category !== catFilter) return false;
    if (from && e.expense_date < from) return false;
    if (to && e.expense_date > to) return false;
    return true;
  }), [all, catFilter, from, to]);

  const totals = useMemo(() => {
    const byCat: Record<string, number> = {};
    let total = 0;
    for (const e of filtered) {
      const a = Number(e.amount_usd) || 0;
      byCat[e.category] = (byCat[e.category] ?? 0) + a;
      total += a;
    }
    return { total, byCat };
  }, [filtered]);

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("Deleted"); },
  });

  function exportCsv() {
    const rows = [["Date","Category","Amount","Vendor","State","Notes"]];
    for (const e of filtered) rows.push([e.expense_date, e.category, Number(e.amount_usd).toFixed(2), e.vendor ?? "", e.state_code ?? "", (e.notes ?? "").replace(/\n/g, " ")]);
    rows.push([]);
    rows.push(["TOTAL", "", totals.total.toFixed(2), "", "", ""]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container max-w-3xl py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="size-6 text-primary" /> Expenses</h1>
          <p className="text-sm text-muted-foreground">Track and export deductible business expenses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="size-4 mr-2" /> CSV</Button>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4 mr-2" /> Add</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-xl font-bold">${totals.total.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Count</div>
          <div className="text-xl font-bold">{filtered.length}</div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-muted-foreground mb-1">By category</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(totals.byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <span key={c} className="text-[11px] rounded-md bg-muted px-2 py-0.5">{c}: ${v.toFixed(0)}</span>
            ))}
            {!Object.keys(totals.byCat).length && <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <Label className="text-xs">Category</Label>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" /></div>
        {(catFilter || from || to) && <Button variant="ghost" size="sm" onClick={() => { setCatFilter(""); setFrom(""); setTo(""); }}>Clear</Button>}
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

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No expenses yet.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-card p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5", "bg-primary/15 text-primary")}>{e.category}</span>
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

type Payload = { expenseDate: string; category: typeof EXPENSE_CATEGORIES[number]; amountUsd: number; vendor: string | null; stateCode: string | null; notes: string | null };

function ExpenseForm({ initial, onClose, onSubmit }: { initial: Expense | null; onClose: () => void; onSubmit: (p: Payload) => void | Promise<void> }) {
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
            await onSubmit({
              expenseDate: date, category: cat, amountUsd: parseFloat(amount),
              vendor: vendor || null, stateCode: state || null, notes: notes || null,
            });
          } finally { setSubmitting(false); }
        }}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}{initial ? "Save" : "Add"}</Button>
      </div>
    </div>
  );
}
