export const SUBSCRIPTION_PLANS = ["owner_operator", "small_fleet", "growth_fleet", "fleet_pro", "enterprise"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const READ_ONLY_STATUSES: SubscriptionStatus[] = ["past_due", "suspended", "cancelled"];

export type PlanCatalogEntry = {
  id: string;
  plan: SubscriptionPlan;
  displayName: string;
  description: string | null;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  truckLimit: number | null;
  userLimit: number | null;
  features: string[];
  sortOrder: number;
  isActive: boolean;
};

export type CompanySubscription = {
  companyId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  paymentMethodOnFile: boolean;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  readOnly: boolean;
  cancelledAt: string | null;
  features: Record<string, { enabled: boolean; usageLimit: number | null }>;
};

export function statusLabel(s: SubscriptionStatus): string {
  switch (s) {
    case "trial": return "Trial";
    case "active": return "Active";
    case "past_due": return "Past Due";
    case "suspended": return "Suspended";
    case "cancelled": return "Cancelled";
  }
}

export function isReadOnly(s: SubscriptionStatus): boolean {
  return READ_ONLY_STATUSES.includes(s);
}
