import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDocuments, createDocument, updateDocument, deleteDocument, type WalletDoc } from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FolderLock, Plus, Trash2, Loader2, AlertTriangle, FileText, ExternalLink, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";

const DOC_CATEGORIES = ["", "CDL", "Medical", "Drug Testing", "Employment", "Training", "Safety"];

export const Route = createFileRoute("/_authenticated/documents")({ component: DocumentsPage });

const DOC_TYPES = ["CDL", "Medical Card", "Truck Registration", "Trailer Registration", "Insurance", "MC Authority", "IFTA Sticker", "IRP Cab Card", "TWIC", "HAZMAT", "Other"];

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

function DocumentsPage() {
  const fetchAll = useServerFn(listDocuments);
  const create = useServerFn(createDocument);
  const update = useServerFn(updateDocument);
  const remove = useServerFn(deleteDocument);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<WalletDoc | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fleet, setFleet] = useState<FleetFilterValue>(emptyFleetFilters);
  const [category, setCategory] = useState<string>("");

  const { data, isLoading } = useQuery({ queryKey: ["documents"], queryFn: () => fetchAll() });
  const allDocs = data?.docs ?? [];
  const docs = useMemo(() => allDocs.filter((d) => {
    const r = d as unknown as Record<string, unknown>;
    if (fleet.driverId && r.driver_id !== fleet.driverId) return false;
    if (category && r.category !== category) return false;
    return true;
  }), [allDocs, fleet, category]);

  const buckets = useMemo(() => {
    const expired: WalletDoc[] = [], soon: WalletDoc[] = [], ok: WalletDoc[] = [];
    for (const d of docs) {
      const n = daysUntil(d.expires_on);
      if (n === null) ok.push(d);
      else if (n < 0) expired.push(d);
      else if (n <= 30) soon.push(d);
      else ok.push(d);
    }
    return { expired, soon, ok };
  }, [docs]);

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); toast.success("Deleted"); },
  });

  return (
    <div className="container max-w-3xl py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FolderLock className="size-6 text-primary" /> Document Wallet</h1>
          <p className="text-sm text-muted-foreground">Track expirations for CDL, medical, registration, insurance</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4 mr-2" /> Add doc</Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FleetFilters value={fleet} onChange={setFleet} showTruck={false} showDates={false} />
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Category</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="block h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[140px]"
          >
            {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c || "All categories"}</option>)}
          </select>
        </div>
      </div>

      {(buckets.expired.length > 0 || buckets.soon.length > 0) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5" />
          <div>
            {buckets.expired.length > 0 && <div><strong>{buckets.expired.length}</strong> document{buckets.expired.length > 1 ? "s" : ""} expired.</div>}
            {buckets.soon.length > 0 && <div><strong>{buckets.soon.length}</strong> expiring within 30 days.</div>}
          </div>
        </div>
      )}

      {showForm && (
        <DocForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={async (p) => {
            try {
              if (editing) await update({ data: { id: editing.id, ...p } });
              else await create({ data: p });
              qc.invalidateQueries({ queryKey: ["documents"] });
              toast.success(editing ? "Updated" : "Added");
              setShowForm(false); setEditing(null);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No documents saved yet.</div>
      ) : (
        <div className="space-y-2">
          {[...buckets.expired, ...buckets.soon, ...buckets.ok].map((d) => {
            const n = daysUntil(d.expires_on);
            const tone = n === null ? "muted" : n < 0 ? "destructive" : n <= 30 ? "amber" : "ok";
            return (
              <div key={d.id} className={cn(
                "rounded-lg border bg-card p-3 flex items-start gap-3",
                tone === "destructive" && "border-destructive/40",
                tone === "amber" && "border-amber-500/40",
                tone === "ok" && "border-border",
                tone === "muted" && "border-border",
              )}>
                <FileText className="size-5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{d.title}</span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{d.doc_type}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                    {d.issuer && <span>{d.issuer}</span>}
                    {d.doc_number && <span>· #{d.doc_number}</span>}
                    {d.expires_on && (
                      <span className={cn(
                        "font-medium",
                        n != null && n < 0 && "text-destructive",
                        n != null && n >= 0 && n <= 30 && "text-amber-600 dark:text-amber-400",
                      )}>
                        {n == null ? null : n < 0 ? `Expired ${-n}d ago` : n === 0 ? "Expires today" : `Expires in ${n}d (${d.expires_on})`}
                      </span>
                    )}
                    {!d.expires_on && <span className="flex items-center gap-1"><CheckCircle2 className="size-3" /> No expiry</span>}
                  </div>
                  {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1"><ExternalLink className="size-3" /> Open file</a>}
                  {d.notes && <div className="text-xs text-muted-foreground italic mt-1">"{d.notes}"</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(d); setShowForm(true); }}>Edit</Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete?")) del.mutate(d.id); }}><Trash2 className="size-4 text-muted-foreground" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type DocPayload = {
  docType: string; title: string; issuer: string | null; docNumber: string | null;
  issuedOn: string | null; expiresOn: string | null; notes: string | null; fileUrl: string | null;
};

function DocForm({ initial, onClose, onSubmit }: { initial: WalletDoc | null; onClose: () => void; onSubmit: (p: DocPayload) => void | Promise<void> }) {
  const [docType, setDocType] = useState(initial?.doc_type ?? "CDL");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [issuer, setIssuer] = useState(initial?.issuer ?? "");
  const [docNumber, setDocNumber] = useState(initial?.doc_number ?? "");
  const [issuedOn, setIssuedOn] = useState(initial?.issued_on ?? "");
  const [expiresOn, setExpiresOn] = useState(initial?.expires_on ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [fileUrl, setFileUrl] = useState(initial?.file_url ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">{initial ? "Edit document" : "New document"}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Type</Label>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Texas Class A CDL" /></div>
        <div><Label className="text-xs">Issuer</Label><Input value={issuer} onChange={(e) => setIssuer(e.target.value)} maxLength={200} /></div>
        <div><Label className="text-xs">Document #</Label><Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} maxLength={80} /></div>
        <div><Label className="text-xs">Issued</Label><Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></div>
        <div><Label className="text-xs">Expires</Label><Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></div>
      </div>
      <div><Label className="text-xs">File URL (optional)</Label><Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://..." /></div>
      <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submitting} onClick={async () => {
          if (!title.trim()) { toast.error("Title required"); return; }
          setSubmitting(true);
          try {
            await onSubmit({
              docType, title: title.trim(),
              issuer: issuer || null, docNumber: docNumber || null,
              issuedOn: issuedOn || null, expiresOn: expiresOn || null,
              notes: notes || null, fileUrl: fileUrl || null,
            });
          } finally { setSubmitting(false); }
        }}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}{initial ? "Save" : "Add"}</Button>
      </div>
    </div>
  );
}
