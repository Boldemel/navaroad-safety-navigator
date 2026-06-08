import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { listUsersWithRoles, setUserRole, type UserWithRoles } from "@/lib/admin-moderation.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

const ROLES = ["admin", "moderator"] as const;
type Role = (typeof ROLES)[number];

function UsersPage() {
  const isAdmin = useIsAdmin();
  const [q, setQ] = useState("");
  const listFn = useServerFn(listUsersWithRoles);
  const roleFn = useServerFn(setUserRole);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  const mutate = useMutation({
    mutationFn: (vars: { user_id: string; role: Role; grant: boolean }) => roleFn({ data: vars }),
    onSuccess: (_d, v) => {
      toast.success(`${v.grant ? "Granted" : "Revoked"} ${v.role}.`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Admins only</h1>
          <p className="text-sm text-muted-foreground mt-2">
            You need the admin role to manage user roles.
          </p>
        </Card>
      </div>
    );
  }

  const needle = q.trim().toLowerCase();
  const filtered = (data ?? []).filter((u: UserWithRoles) =>
    !needle || (u.driver_name?.toLowerCase().includes(needle) ?? false) || u.id.toLowerCase().includes(needle),
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">User roles</h1>
          <p className="text-sm text-muted-foreground">Grant or revoke admin and moderator access.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <Input placeholder="Search by name or user id…" value={q} onChange={(e) => setQ(e.target.value)} />

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No users match.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <Card key={u.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{u.driver_name ?? "(no name)"}</div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">{u.id}</div>
                <div className="flex items-center gap-1 mt-1">
                  {u.roles.length === 0 ? (
                    <Badge variant="outline">user</Badge>
                  ) : (
                    u.roles.map((r) => (
                      <Badge key={r} variant={r === "admin" ? "destructive" : "secondary"}>{r}</Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {ROLES.map((r) => {
                  const has = u.roles.includes(r);
                  return (
                    <Button
                      key={r}
                      size="sm"
                      variant={has ? "outline" : "default"}
                      onClick={() => mutate.mutate({ user_id: u.id, role: r, grant: !has })}
                      disabled={mutate.isPending}
                    >
                      {has ? `Revoke ${r}` : `Grant ${r}`}
                    </Button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
