/** Shared Stripe helpers safe for both client and server bundles. */
import type { SubscriptionPlan } from "./subscription.shared";

export type CheckoutSessionResult = { url: string };
export type PortalSessionResult = { url: string };

export type AdminCompanyBilling = {
  companyId: string;
  companyName: string;
  ownerEmail: string | null;
  plan: SubscriptionPlan;
  status: string;
  trialEndsAt: string | null;
  paymentMethodOnFile: boolean;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  monthlyPriceUsd: number;
  cancelledAt: string | null;
};
