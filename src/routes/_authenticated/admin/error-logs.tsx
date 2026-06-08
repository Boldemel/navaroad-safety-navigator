import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/error-logs")({
  component: ErrorLogsPage,
});

type ErrorLog = {
  id: string;
  created_at: string;
  source: string;
  message: string;
  stack: string | null;
  url: string | null;
  route: string | null;
  severity: string;
  user_id: string | null;
};

function ErrorLogsPage() {
  const isAdmin = useIsAdmin();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    // Tiny grace period for the role check before deciding access.
    const t = setTimeout(() => setChecked(true), 600);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["error-logs"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as ErrorLog[];
    },
  });

  if (!isAdmin && checked) {
    return (
      <AppShell>
        <div className="p-6">
          <Card className="p-6">
            <h1 className="text-lg font-semibold">Admins only</h1>
            <p className="text-sm text-muted-foreground mt-2">
              You need the admin role to view error logs.
            </p>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Error logs</h1>
            <p className="text-sm text-muted-foreground">Latest 200 captured errors.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        {isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
        ) : !data || data.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No errors recorded. 🎉</Card>
        ) : (
          <div className="space-y-2">
            {data.map((e) => (
              <Card key={e.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={e.severity === "error" ? "destructive" : "secondary"}>
                      {e.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">{e.source}</span>
                    {e.route && (
                      <span className="text-xs text-muted-foreground">{e.route}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="text-sm font-medium break-words">{e.message}</div>
                {e.stack && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Stack</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px]">
                      {e.stack}
                    </pre>
                  </details>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
