import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, Lock } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { statusLabel } from "@/lib/subscription.shared";

/**
 * Top-of-app banner showing trial days remaining, read-only mode, or past-due warnings.
 * Renders nothing when subscription is active and not in trial.
 */
export function SubscriptionBanner() {
  const { data: sub } = useSubscription();
  if (!sub) return null;

  if (sub.readOnly) {
    return (
      <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
        <Lock className="size-4 shrink-0" />
        <span className="flex-1">
          <strong>Read-only mode.</strong> Status: {statusLabel(sub.status)}. You can view and export data but cannot make changes.
        </span>
        <Link to="/billing" className="font-medium underline">Reactivate billing</Link>
      </div>
    );
  }

  if (sub.status === "trial") {
    const days = sub.trialDaysRemaining;
    const endStr = sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString() : "";
    return (
      <div className="flex items-center gap-2 border-b bg-primary/10 px-4 py-2 text-sm">
        <Clock className="size-4 shrink-0" />
        <span className="flex-1">
          <strong>Trial:</strong> {days} day{days === 1 ? "" : "s"} remaining (ends {endStr}).
          {!sub.paymentMethodOnFile && " Add a payment method to keep service after the trial."}
        </span>
        <Link to="/billing" className="font-medium underline">Manage billing</Link>
      </div>
    );
  }

  if (sub.status === "past_due") {
    return (
      <div className="flex items-center gap-2 border-b bg-yellow-500/15 px-4 py-2 text-sm">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="flex-1"><strong>Payment past due.</strong> Update your payment method to avoid losing write access.</span>
        <Link to="/billing" className="font-medium underline">Update billing</Link>
      </div>
    );
  }

  return null;
}
