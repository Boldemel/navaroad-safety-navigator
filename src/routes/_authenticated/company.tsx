import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, UserPlus, Trash2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getMyCompany, listCompanyMembers, updateCompanyName,
  addCompanyMemberByEmail, removeCompanyMember, setMemberRoles, setPermissionOverride,
} from "@/lib/company.functions";
import {
  ROLES, PERMISSIONS,
  type CompanyRole, type AppPermission, type CompanyMember,
} from "@/lib/company.shared";


export const Route = createFileRoute("/_authenticated/company")({
  component: CompanyPage,
});

const ROLE_LABELS: Record<CompanyRole, string> = {
  fleet_owner: "Fleet Owner",
  dispatcher: "Dispatcher",
  safety_manager: "Safety Manager",
  maintenance_manager: "Maintenance Manager",
  driver: "Driver",
};

function CompanyPage() {
  const qc = useQueryClient();
  const getCompanyFn = useServerFn(getMyCompany);
  const listMembersFn = useServerFn(listCompanyMembers);
  const updateNameFn = useServerFn(updateCompanyName);
  const addMemberFn = useServerFn(addCompanyMemberByEmail);

  const company = useQuery({ queryKey: ["my-company"], queryFn: () => getCompanyFn() });
  const companyId = company.data?.id;
  const isOwner = company.data?.isOwner ?? false;
  const canManageMembers = isOwner || (company.data?.myRoles.includes("fleet_owner") ?? false);

  const members = useQuery({
    queryKey: ["company-members", companyId],
    queryFn: () => listMembersFn({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const [name, setName] = useState("");
  const renameMut = useMutation({
    mutationFn: (v: { companyId: string; name: string }) => updateNameFn({ data: v }),
    onSuccess: () => { toast.success("Company renamed."); qc.invalidateQueries({ queryKey: ["my-company"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to rename"),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoles, setInviteRoles] = useState<CompanyRole[]>(["driver"]);
  const inviteMut = useMutation({
    mutationFn: () => addMemberFn({ data: { companyId: companyId!, email: inviteEmail.trim(), roles: inviteRoles } }),
    onSuccess: () => {
      toast.success("Member added.");
      setInviteEmail(""); setInviteRoles(["driver"]);
      qc.invalidateQueries({ queryKey: ["company-members", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add member"),
  });

  if (company.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!company.data) return <div className="p-8 text-sm text-muted-foreground">No company found.</div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <Building2 className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight truncate">{company.data.name}</h1>
          <p className="text-muted-foreground text-sm">
            {company.data.myRoles.map((r) => ROLE_LABELS[r]).join(" · ") || "Member"}
          </p>
        </div>
      </div>

      {/* Company name */}
      <Card className="p-5 space-y-3">
        <div className="font-medium">Company details</div>
        <div className="space-y-1.5">
          <Label>Name</Label>
          <div className="flex gap-2">
            <Input
              value={name || company.data.name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner && !company.data.myRoles.includes("fleet_owner")}
            />
            <Button
              onClick={() => renameMut.mutate({ companyId: company.data!.id, name: (name || company.data!.name).trim() })}
              disabled={renameMut.isPending || (!isOwner && !company.data.myRoles.includes("fleet_owner"))}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>

      {/* Add member */}
      {canManageMembers && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-medium"><UserPlus className="size-4" /> Add member</div>
          <p className="text-xs text-muted-foreground">
            The person must already have a Navaroad account. Ask them to sign up first, then add them here.
          </p>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2">
            <Input
              type="email"
              placeholder="driver@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <Button onClick={() => inviteMut.mutate()} disabled={!inviteEmail || inviteRoles.length === 0 || inviteMut.isPending}>
              {inviteMut.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2">Roles to assign</div>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={inviteRoles.includes(r)}
                    onCheckedChange={(v) =>
                      setInviteRoles((prev) => v ? Array.from(new Set([...prev, r])) : prev.filter((x) => x !== r))
                    }
                  />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Members list */}
      <Card className="p-5 space-y-3">
        <div className="font-medium">Members ({members.data?.length ?? 0})</div>
        {members.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading members…</div>
        ) : (members.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">No members yet.</div>
        ) : (
          <div className="space-y-2">
            {(members.data ?? []).map((m) => (
              <MemberRow key={m.memberId} member={m} canManage={canManageMembers} companyId={companyId!} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MemberRow({ member, canManage, companyId }: { member: CompanyMember; canManage: boolean; companyId: string }) {
  const qc = useQueryClient();
  const setRolesFn = useServerFn(setMemberRoles);
  const removeFn = useServerFn(removeCompanyMember);
  const setOverrideFn = useServerFn(setPermissionOverride);
  const [expanded, setExpanded] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["company-members", companyId] });

  const rolesMut = useMutation({
    mutationFn: (roles: CompanyRole[]) => setRolesFn({ data: { memberId: member.memberId, roles } }),
    onSuccess: () => { toast.success("Roles updated."); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const removeMut = useMutation({
    mutationFn: () => removeFn({ data: { memberId: member.memberId } }),
    onSuccess: () => { toast.success("Member removed."); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const overrideMut = useMutation({
    mutationFn: (v: { permission: AppPermission; value: "grant" | "deny" | "default" }) =>
      setOverrideFn({ data: { memberId: member.memberId, ...v } }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const overrideMap = useMemo(() => {
    const m = new Map<AppPermission, boolean>();
    for (const o of member.overrides) m.set(o.permission, o.granted);
    return m;
  }, [member.overrides]);

  function toggleRole(role: CompanyRole, on: boolean) {
    const next = on ? Array.from(new Set([...member.roles, role])) : member.roles.filter((r) => r !== role);
    rolesMut.mutate(next);
  }

  return (
    <div className="rounded-lg border border-border bg-card/50">
      <div className="p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {member.driverName || "(no name)"}
            {member.isOwner && <Badge variant="outline" className="ml-2">Owner</Badge>}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{member.email || member.userId}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {member.roles.length === 0 ? (
              <Badge variant="outline">no roles</Badge>
            ) : (
              member.roles.map((r) => <Badge key={r} variant="secondary">{ROLE_LABELS[r]}</Badge>)
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
              <ShieldCheck className="size-4 mr-1.5" />
              {expanded ? "Close" : "Manage"}
            </Button>
          )}
          {canManage && !member.isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost"><Trash2 className="size-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove member?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {member.driverName || member.email} will lose access to this company.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeMut.mutate()}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {expanded && canManage && (
        <div className="p-3 border-t border-border space-y-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Roles</div>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((r) => (
                <label key={r} className={`flex items-center gap-2 text-sm cursor-pointer ${member.isOwner && r === "fleet_owner" ? "opacity-60" : ""}`}>
                  <Checkbox
                    checked={member.roles.includes(r)}
                    onCheckedChange={(v) => toggleRole(r, !!v)}
                    disabled={rolesMut.isPending || (member.isOwner && r === "fleet_owner")}
                  />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Permission overrides</div>
            <p className="text-[11px] text-muted-foreground mb-2">
              Default = use what their roles allow. Grant = always allow. Deny = always block.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {PERMISSIONS.map((p) => {
                const has = overrideMap.has(p);
                const value: "grant" | "deny" | "default" = !has ? "default" : overrideMap.get(p) ? "grant" : "deny";
                return (
                  <div key={p} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono truncate">{p}</span>
                    <Select
                      value={value}
                      onValueChange={(v) => overrideMut.mutate({ permission: p, value: v as any })}
                    >
                      <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="grant">Grant</SelectItem>
                        <SelectItem value="deny">Deny</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
