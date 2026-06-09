import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMySubscription } from "@/lib/subscription.functions";
import type { CompanySubscription } from "@/lib/subscription.shared";

/**
 * Current user's company subscription + feature matrix.
 * Cached for 60s so feature checks across the app don't refetch.
 */
export function useSubscription() {
  const fetcher = useServerFn(getMySubscription);
  return useQuery<CompanySubscription | null>({
    queryKey: ["subscription", "me"],
    queryFn: () => fetcher(),
    staleTime: 60_000,
  });
}

/** Returns true if the current company has the given feature enabled. */
export function useFeature(featureKey: string): {
  loading: boolean;
  enabled: boolean;
  usageLimit: number | null;
  readOnly: boolean;
} {
  const { data, isLoading } = useSubscription();
  const f = data?.features?.[featureKey];
  return {
    loading: isLoading,
    enabled: !!f?.enabled,
    usageLimit: f?.usageLimit ?? null,
    readOnly: !!data?.readOnly,
  };
}
