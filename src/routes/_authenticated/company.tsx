import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  UserPlus,
  Trash2,
  ShieldCheck,
  KeyRound,
  Power,
  History,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getMyCompany, listCompanyMembers, updateCompanyName,
  removeCompanyMember, setMemberRoles, setPermissionOverride,
} from "@/lib/company.functions";
import {
  createCompanyUser, resetUserPassword, setUserActive, listTeamAuditLogs,
} from "@/lib/team.functions";
import {
  ROLES, PERMISSIONS,
  type CompanyRole, type AppPermission, type CompanyMember,
} from "@/lib/company.shared";

export const Route = createFileRoute("/_authenticated/company")({
  component: CompanyPage,
});

const ROLE_LABELS: Record<CompanyRole, string> = {
  fleet_owner: "Fleet Owner",
  fleet_manager: "Fleet Manager",
  dispatcher: "Dispatcher",
  safety_manager: "Safety Manager",
  maintenance_manager: "Maintenance Manager",
  accountant: "Accountant",
  driver: "Driver",
};

function genTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
  return out + "!9";
}

function CompanyPage() {
  const qc = useQueryClient();
  const getCompanyFn = useServerFn(getMyCompany);
  const listMembersFn = useServerFn(listCompanyMembers);
  const updateNameFn = useServerFn(updateCompanyName);

  const company = useQuery({ queryKey: ["my-company"], queryFn: () => getCompanyFn() });
  const companyId = company.data?.id;
  const isOwner = company.data?.isOwner ?? false;
  const canManageMembers = isOwner || (company.data?.myRoles.includes("fleet_owner") ?? false)
    || (company.data?.myRoles.includes("fleet_manager") ?? false);

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

      <Tabs defaultValue="members" className="space-y-4">
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          <TabsTrigger value="members">Team</TabsTrigger>
          <TabsTrigger value="audit">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          {canManageMembers && companyId && (
            <CreateUserCard companyId={companyId} onCreated={() => qc.invalidateQueries({ queryKey: ["company-members", companyId] })} />
          )}

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
        </TabsContent>

        <TabsContent value="audit">
          {companyId && canManageMembers ? (
            <AuditCard companyId={companyId} />
          ) : (
            <Card className="p-5 text-sm text-muted-foreground">Only managers can view activity.</Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CreateUserCard({ companyId, onCreated }: { companyId: string; onCreated: () => void }) {
  const createFn = useServerFn(createCompanyUser);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    tempPassword: genTempPassword(),
    phone: "",
    employeeId: "",
    assignedTruck: "",
    assignedTrailer: "",
    active: true,
    roles: ["driver"] as CompanyRole[],
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { companyId, ...form } }),
    onSuccess: () => {
      toast.success("User created. Share the temporary password with them.");
      onCreated();
      setOpen(false);
      setForm({
        firstName: "", lastName: "", email: "",
        tempPassword: genTempPassword(),
        phone: "", employeeId: "", assignedTruck: "", assignedTrailer: "",
        active: true, roles: ["driver"],
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create user"),
  });

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium"><UserPlus className="size-4" /> Create user</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">New user</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                You create the credentials directly — no email invitation is sent.
                The user will be required to change this password on first login.
              </DialogDescription>
            </DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Email (login ID)</Label>
                <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Temporary password</Label>
                <div className="flex gap-2">
                  <Input value={form.tempPassword} onChange={(e) => set({ tempPassword: e.target.value })} />
                  <Button type="button" variant="outline" onClick={() => set({ tempPassword: genTempPassword() })}>
                    Generate
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Share with the user via your own channel. They'll be forced to change it on first login.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Driver / Employee ID</Label>
                <Input value={form.employeeId} onChange={(e) => set({ employeeId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned truck</Label>
                <Input value={form.assignedTruck} onChange={(e) => set({ assignedTruck: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned trailer</Label>
                <Input value={form.assignedTrailer} onChange={(e) => set({ assignedTrailer: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Roles</Label>
                <div className="flex flex-wrap gap-3">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.roles.includes(r)}
                        onCheckedChange={(v) =>
                          set({ roles: v ? Array.from(new Set([...form.roles, r])) : form.roles.filter((x) => x !== r) })
                        }
                      />
                      {ROLE_LABELS[r]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between sm:col-span-2 rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Active</div>
                  <div className="text-xs text-muted-foreground">Inactive users can't sign in.</div>
                </div>
                <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={
                  createMut.isPending ||
                  !form.firstName || !form.lastName || !form.email ||
                  form.tempPassword.length < 8 || form.roles.length === 0
                }
              >
                {createMut.isPending ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted-foreground">
        Onboard drivers and staff without email invites. You set the temporary password and share it through your normal company channel.
      </p>
    </Card>
  );
}

function MemberRow({ member, canManage, companyId }: { member: CompanyMember; canManage: boolean; companyId: string }) {
  const qc = useQueryClient();
  const setRolesFn = useServerFn(setMemberRoles);
  const removeFn = useServerFn(removeCompanyMember);
  const setOverrideFn = useServerFn(setPermissionOverride);
  const resetFn = useServerFn(resetUserPassword);
  const setActiveFn = useServerFn(setUserActive);
  const [expanded, setExpanded] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [tempPw, setTempPw] = useState(genTempPassword());

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
  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { companyId, targetUserId: member.userId, tempPassword: tempPw } }),
    onSuccess: () => { toast.success("Password reset. Share the new temporary password."); setResetOpen(false); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const activeMut = useMutation({
    mutationFn: (active: boolean) => setActiveFn({ data: { companyId, targetUserId: member.userId, active } }),
    onSuccess: () => { toast.success("Status updated."); invalidate(); },
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

  const displayName = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.driverName || "(no name)";

  return (
    <div className="rounded-lg border border-border bg-card/50">
      <div className="p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {displayName}
            {member.isOwner && <Badge variant="outline" className="ml-2">Owner</Badge>}
            {!member.active && <Badge variant="destructive" className="ml-2">Inactive</Badge>}
            {member.mustChangePassword && <Badge variant="outline" className="ml-2">Pwd reset pending</Badge>}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{member.email || member.userId}</div>
          {(member.employeeId || member.assignedTruck || member.assignedTrailer || member.phone) && (
            <div className="text-[11px] text-muted-foreground truncate">
              {[
                member.employeeId && `ID ${member.employeeId}`,
                member.assignedTruck && `Truck ${member.assignedTruck}`,
                member.assignedTrailer && `Trailer ${member.assignedTrailer}`,
                member.phone,
              ].filter(Boolean).join(" · ")}
            </div>
          )}
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
            <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); if (v) setTempPw(genTempPassword()); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" title="Reset password"><KeyRound className="size-4" /></Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset password</DialogTitle>
                  <DialogDescription>
                    Set a new temporary password for {displayName}. They'll be required to change it at next login.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label>Temporary password</Label>
                  <div className="flex gap-2">
                    <Input value={tempPw} onChange={(e) => setTempPw(e.target.value)} />
                    <Button type="button" variant="outline" onClick={() => setTempPw(genTempPassword())}>Generate</Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
                  <Button onClick={() => resetMut.mutate()} disabled={resetMut.isPending || tempPw.length < 8}>
                    {resetMut.isPending ? "Resetting…" : "Reset password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canManage && !member.isOwner && (
            <Button
              size="sm"
              variant={member.active ? "outline" : "default"}
              title={member.active ? "Deactivate" : "Reactivate"}
              onClick={() => activeMut.mutate(!member.active)}
              disabled={activeMut.isPending}
            >
              <Power className="size-4" />
            </Button>
          )}
          {canManage && !member.isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" title="Remove from company"><Trash2 className="size-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove member?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {displayName} will lose access to this company. Their historical records remain.
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

const ACTION_LABELS: Record<string, string> = {
  user_created: "User created",
  password_reset: "Password reset",
  user_deactivated: "User deactivated",
  user_reactivated: "User reactivated",
  role_changed: "Role changed",
};

function AuditCard({ companyId }: { companyId: string }) {
  const listFn = useServerFn(listTeamAuditLogs);
  const q = useQuery({
    queryKey: ["team-audit", companyId],
    queryFn: () => listFn({ data: { companyId, limit: 100 } }),
  });
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2 font-medium"><History className="size-4" /> Recent activity</div>
      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground">No activity yet.</div>
      ) : (
        <div className="space-y-2">
          {(q.data ?? []).map((row: any) => (
            <div key={row.id} className="text-xs flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
              <div className="min-w-0">
                <div className="font-medium">{ACTION_LABELS[row.action] ?? row.action}</div>
                <div className="text-muted-foreground truncate">
                  {row.details && Object.keys(row.details).length > 0 ? JSON.stringify(row.details) : ""}
                </div>
              </div>
              <div className="text-muted-foreground whitespace-nowrap">
                {new Date(row.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
