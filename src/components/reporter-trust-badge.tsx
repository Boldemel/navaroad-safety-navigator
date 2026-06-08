import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getReporterProfiles, type ReporterProfile } from "@/lib/reporter-profiles.functions";
import { ShieldCheck, Star, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export function useReporterProfiles(userIds: Array<string | null | undefined>) {
  const fn = useServerFn(getReporterProfiles);
  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const id of userIds) if (id) set.add(id);
    return Array.from(set).sort();
  }, [userIds]);
  return useQuery({
    queryKey: ["reporter-profiles", ids.join(",")],
    queryFn: () => fn({ data: { userIds: ids } }),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    meta: { suppressErrorToast: true },
  });
}

export function ReporterTrustBadge({ profile, className }: { profile: ReporterProfile | undefined; className?: string }) {
  if (!profile) return null;
  const { tier, confirmedReports, totalReports } = profile;
  const styles =
    tier === "trusted"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : tier === "active"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
        : "border-border bg-muted text-muted-foreground";
  const Icon = tier === "trusted" ? ShieldCheck : tier === "active" ? Star : UserPlus;
  const label =
    tier === "trusted"
      ? `Trusted · ${confirmedReports} confirmed`
      : tier === "active"
        ? `Active · ${totalReports} reports`
        : "New driver";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        styles,
        className,
      )}
      title={`${totalReports} total, ${confirmedReports} community-confirmed`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
