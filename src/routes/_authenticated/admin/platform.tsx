import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { CompaniesTab } from "@/components/platform-admin/companies-tab";
import { BillingTab } from "@/components/platform-admin/billing-tab";

export const Route = createFileRoute("/_authenticated/admin/platform")({
  component: PlatformAdminPage,
});

const TABS = [
  { value: "companies", label: "Companies" },
  { value: "users", label: "Users" },
  { value: "plans", label: "Plans" },
  { value: "billing", label: "Billing" },
  { value: "analytics", label: "Analytics" },
  { value: "health", label: "System Health" },
  { value: "support", label: "Support" },
  { value: "impersonation", label: "Impersonation" },
] as const;

function PlatformAdminPage() {
  const { loading, isSuperAdmin } = useIsSuperAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isSuperAdmin, navigate]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>;
  if (!isSuperAdmin) return null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">Platform Admin</h1>
        <span className="text-xs text-muted-foreground ml-2">Super admin only — sits above all companies</span>
      </div>

      <Tabs defaultValue="companies" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            {t.value === "companies" ? (
              <CompaniesTab />
            ) : t.value === "billing" ? (
              <BillingTab />
            ) : (
              <Card>
                <CardHeader><CardTitle className="text-base">{t.label}</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {placeholderFor(t.value)}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function placeholderFor(v: string) {
  switch (v) {
    case "companies": return "List, create, suspend, or delete companies. (Wiring pending.)";
    case "users": return "Total users across all companies, with filter and search. (Wiring pending.)";
    case "plans": return "Manage subscription plans, pricing, and the feature access matrix. (Wiring pending.)";
    case "billing": return "Billing status per company. (Stripe not connected yet.)";
    case "analytics": return "Platform analytics — signups, active companies, plan distribution. (Wiring pending.)";
    case "health": return "System health, error logs, edge function status. (Wiring pending.)";
    case "support": return "Inbound support requests from companies. (Wiring pending.)";
    case "impersonation": return "Read-only view-as a company for support. Every session is logged. (Wiring pending.)";
    default: return "";
  }
}
