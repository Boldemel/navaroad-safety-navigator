import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { adminListCompanyBilling } from "@/lib/stripe.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function BillingTab() {
  const fetcher = useServerFn(adminListCompanyBilling);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "billing"],
    queryFn: () => fetcher(),
  });

  if (isLoading) return (
    <div className="flex justify-center p-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
  );
  if (error) return <div className="p-4 text-sm text-destructive">{(error as Error).message}</div>;

  const rows = data ?? [];
  const totals = {
    trial: rows.filter((r) => r.status === "trial").length,
    active: rows.filter((r) => r.status === "active").length,
    pastDue: rows.filter((r) => r.status === "past_due").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    mrr: rows.filter((r) => r.status === "active").reduce((s, r) => s + (r.monthlyPriceUsd || 0), 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="On trial" value={totals.trial} />
        <SummaryCard label="Active" value={totals.active} />
        <SummaryCard label="Past due" value={totals.pastDue} />
        <SummaryCard label="Cancelled" value={totals.cancelled} />
        <SummaryCard label="MRR (active)" value={`$${totals.mrr.toLocaleString()}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Companies</CardTitle>
          <CardDescription>Subscription status synced from Stripe webhooks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial ends</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Stripe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.companyId}>
                    <TableCell className="font-medium">{r.companyName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.ownerEmail ?? "—"}</TableCell>
                    <TableCell className="capitalize">{r.plan.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant={
                        r.status === "active" ? "default" :
                        r.status === "trial" ? "secondary" :
                        "destructive"
                      }>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.trialEndsAt ? new Date(r.trialEndsAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-sm">
                      {r.paymentMethodOnFile
                        ? `${(r.paymentMethodBrand ?? "card").toUpperCase()} ••${r.paymentMethodLast4 ?? ""}`
                        : <span className="text-muted-foreground">none</span>}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {r.stripeCustomerId ? r.stripeCustomerId.slice(0, 14) + "…" : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No companies yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
