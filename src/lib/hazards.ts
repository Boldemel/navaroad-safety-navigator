import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_REPORTS_PER_HOUR = 5;
const DEDUP_RADIUS_MI = 0.3; // ~500m
const DEDUP_WINDOW_MIN = 30;

function haversineMi(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type SubmitHazardInput = {
  hazard_type: string;
  location: string;
  description?: string | null;
  severity: string;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
};

export const submitHazard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SubmitHazardInput) => {
    if (!data.hazard_type || !data.location || !data.severity) {
      throw new Error("Missing required fields.");
    }
    if (data.location.length > 200) throw new Error("Location too long.");
    if (data.description && data.description.length > 1000) throw new Error("Description too long.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Rate limit: max N reports per user per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count: recentCount, error: rateErr } = await supabase
      .from("hazard_reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", userId)
      .gte("created_at", oneHourAgo);
    if (rateErr) throw new Error(rateErr.message);
    if ((recentCount ?? 0) >= MAX_REPORTS_PER_HOUR) {
      throw new Error(`Rate limit: you can submit up to ${MAX_REPORTS_PER_HOUR} hazard reports per hour. Try again later.`);
    }

    // Dedup: if a hazard of the same type was reported nearby very recently,
    // auto-confirm the existing one instead of creating a duplicate.
    if (data.latitude != null && data.longitude != null) {
      const windowAgo = new Date(Date.now() - DEDUP_WINDOW_MIN * 60_000).toISOString();
      const { data: nearby } = await supabase
        .from("hazard_reports")
        .select("id, latitude, longitude, reporter_id")
        .eq("hazard_type", data.hazard_type)
        .eq("status", "active")
        .gte("created_at", windowAgo)
        .limit(50);
      const dup = (nearby ?? []).find(
        (h) =>
          h.latitude != null &&
          h.longitude != null &&
          haversineMi(data.latitude!, data.longitude!, h.latitude, h.longitude) <= DEDUP_RADIUS_MI,
      );
      if (dup) {
        // Auto-confirm the existing report on behalf of this user (idempotent).
        if (dup.reporter_id !== userId) {
          await supabase
            .from("hazard_votes")
            .upsert(
              { hazard_id: dup.id, user_id: userId, vote: "confirm" },
              { onConflict: "hazard_id,user_id" },
            );
        }
        return { ok: true, deduped: true, hazardId: dup.id } as const;
      }
    }

    const { data: inserted, error } = await supabase
      .from("hazard_reports")
      .insert({
        hazard_type: data.hazard_type,
        location: data.location,
        description: data.description ?? null,
        severity: data.severity,
        reporter_id: userId,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        photo_url: data.photo_url ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, deduped: false, hazardId: inserted.id } as const;
  });

export const voteOnHazard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { hazardId: string; vote: "confirm" | "dispute" }) => {
    if (!data.hazardId) throw new Error("hazardId required");
    if (data.vote !== "confirm" && data.vote !== "dispute") throw new Error("Invalid vote");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("hazard_votes")
      .upsert(
        { hazard_id: data.hazardId, user_id: userId, vote: data.vote },
        { onConflict: "hazard_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true } as const;
  });

export const removeMyHazardVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { hazardId: string }) => {
    if (!data.hazardId) throw new Error("hazardId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("hazard_votes")
      .delete()
      .eq("hazard_id", data.hazardId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true } as const;
  });
