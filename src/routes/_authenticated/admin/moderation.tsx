import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listHazardsForModeration, moderateHazard } from "@/lib/admin-moderation.functions";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  component: ModerationPage,
});

type Filter = "all" | "active" | "disputed" | "expired";

function ModerationPage() {
  const isAdmin = useIsAdmin();
  const [filter, setFilter] = useState<Filter>("active");
  const listFn = useServerFn(listHazardsForModeration);
  const moderateFn = useServerFn(moderateHazard);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-hazards", filter],
    queryFn: () => listFn({ data: { status: filter } }),
  });

  const mutate = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "expire" | "reject" | "delete" }) =>
      moderateFn({ data: vars }),
    onSuccess: (_d, v) => {
      toast.success(`Hazard ${v.action}d.`);
      queryClient.invalidateQueries({ queryKey: ["admin-hazards"] });
      queryClient.invalidateQueries({ queryKey: ["hazard_reports"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Admins &amp; moderators only</h1>
          <p className="text-sm text-muted-foreground mt-2">
            You need the admin or moderator role to access the moderation queue.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Hazard moderation</h1>
          <p className="text-sm text-muted-foreground">Approve, expire, reject, or delete driver-reported hazards.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : !data?.length ? (
        <Card className="p-6 text-sm text-muted-foreground">No hazards match this filter.</Card>
      ) : (
        <div className="space-y-2">
          {data.map((h) => (
            <Card key={h.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={h.severity === "high" || h.severity === "critical" ? "destructive" : "secondary"}>
                    {h.severity}
                  </Badge>
                  <Badge variant="outline">{h.status}</Badge>
                  <span className="text-sm font-medium">{h.hazard_type}</span>
                  <span className="text-xs text-muted-foreground">{h.location}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                </span>
              </div>
              {h.description && <p className="text-sm text-muted-foreground">{h.description}</p>}
              <div className="text-xs text-muted-foreground">
                Reporter: {h.reporter_name ?? (h.reporter_id ? h.reporter_id.slice(0, 8) : "Anonymous")} ·
                {" "}{h.confirm_count} confirms · {h.dispute_count} disputes
                {h.expires_at && <> · expires {new Date(h.expires_at).toLocaleString()}</>}
              </div>
              {h.photo_url && (
                <a href={h.photo_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  View photo
                </a>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button size="sm" onClick={() => mutate.mutate({ id: h.id, action: "approve" })} disabled={mutate.isPending}>
                  Approve (24h)
                </Button>
                <Button size="sm" variant="outline" onClick={() => mutate.mutate({ id: h.id, action: "expire" })} disabled={mutate.isPending}>
                  Expire now
                </Button>
                <Button size="sm" variant="outline" onClick={() => mutate.mutate({ id: h.id, action: "reject" })} disabled={mutate.isPending}>
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Delete this hazard permanently?")) mutate.mutate({ id: h.id, action: "delete" });
                  }}
                  disabled={mutate.isPending}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
