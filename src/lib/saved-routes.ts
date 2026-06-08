import { supabase } from "@/integrations/supabase/client";

export const PENDING_ROUTE_KEY = "navaroad.pendingRoute";

export type SavedRoute = {
  id: string;
  origin: string;
  destination: string;
  truck_type: string | null;
  trailer_type: string | null;
  safety_score: number | null;
  created_at: string;
};

export type PendingRoute = {
  origin: string;
  destination: string;
  truck?: string | null;
  trailer?: string | null;
};

export async function listSavedRoutes(): Promise<SavedRoute[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await supabase
    .from("saved_routes")
    .select("id, origin, destination, truck_type, trailer_type, safety_score, created_at")
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveRoute(input: {
  origin: string;
  destination: string;
  truck?: string | null;
  trailer?: string | null;
  safetyScore?: number | null;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const { data: cm } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!cm?.company_id) throw new Error("No company for user.");
  const { error } = await supabase.from("saved_routes").insert({
    user_id: u.user.id,
    company_id: cm.company_id,
    origin: input.origin,
    destination: input.destination,
    truck_type: input.truck ?? null,
    trailer_type: input.trailer ?? null,
    safety_score: input.safetyScore ?? null,
  });
  if (error) throw error;
}

export async function deleteSavedRoute(id: string) {
  const { error } = await supabase.from("saved_routes").delete().eq("id", id);
  if (error) throw error;
}

/** Stash a route for the dashboard to pick up after navigation. */
export function setPendingRoute(r: PendingRoute) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_ROUTE_KEY, JSON.stringify(r));
  } catch {
    /* ignore quota */
  }
}

export function consumePendingRoute(): PendingRoute | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_ROUTE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_ROUTE_KEY);
    return JSON.parse(raw) as PendingRoute;
  } catch {
    return null;
  }
}
