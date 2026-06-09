import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Trash2, Power, PowerOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listAllCompanies, setCompanySuspended, deleteCompany,
  type PlatformCompany,
} from "@/lib/platform-admin.functions";

export function CompaniesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllCompanies);
  const suspendFn = useServerFn(setCompanySuspended);
  const deleteFn = useServerFn(deleteCompany);
  const [q, setQ] = useState("");

  const companies = useQuery({
    queryKey: ["platform-companies"],
    queryFn: () => listFn(),
  });

  const filtered = useMemo(() => {
    const list = companies.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((c) =>
      c.name.toLowerCase().includes(term) ||
      (c.ownerEmail ?? "").toLowerCase().includes(term) ||
      (c.ownerName ?? "").toLowerCase().includes(term),
    );
  }, [companies.data, q]);

  const suspendMut = useMutation({
    mutationFn: (v: { companyId: string; suspended: boolean }) => suspendFn({ data: v }),
    onSuccess: () => {
      toast.success("Updated.");
      qc.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (companyId: string) => deleteFn({ data: { companyId } }),
    onSuccess: () => {
      toast.success("Company deleted.");
      qc.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, owner, email…"
            className="pl-8"
          />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">
          {companies.isLoading ? "Loading…" : `${filtered.length} of ${companies.data?.length ?? 0}`}
        </div>
      </div>

      {companies.isError && (
        <div className="text-sm text-destructive">
          {companies.error instanceof Error ? companies.error.message : "Failed to load companies."}
        </div>
      )}

      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Company</th>
              <th className="text-left px-3 py-2">Owner</th>
              <th className="text-left px-3 py-2">Plan</th>
              <th className="text-left px-3 py-2">Members</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !companies.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No companies found.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <CompanyRow
                key={c.id}
                c={c}
                onToggleSuspend={() =>
                  suspendMut.mutate({
                    companyId: c.id,
                    suspended: c.subscriptionStatus !== "suspended",
                  })
                }
                onDelete={() => deleteMut.mutate(c.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompanyRow({
  c, onToggleSuspend, onDelete,
}: {
  c: PlatformCompany;
  onToggleSuspend: () => void;
  onDelete: () => void;
}) {
  const suspended = c.subscriptionStatus === "suspended";
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium">{c.name}</td>
      <td className="px-3 py-2">
        <div className="text-foreground">{c.ownerName ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{c.ownerEmail ?? "—"}</div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="w-fit">{c.subscriptionPlan}</Badge>
          <Badge variant={suspended ? "destructive" : "secondary"} className="w-fit">
            {c.subscriptionStatus}
          </Badge>
        </div>
      </td>
      <td className="px-3 py-2">{c.memberCount}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {new Date(c.createdAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onToggleSuspend}>
            {suspended ? <Power className="size-3.5 mr-1" /> : <PowerOff className="size-3.5 mr-1" />}
            {suspended ? "Reactivate" : "Suspend"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="size-3.5 mr-1" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the company and all its data (loads, inspections, fuel,
                  maintenance, members, etc.). This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete company</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}
