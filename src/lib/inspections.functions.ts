import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";

export type InspectionDefect = {
  id: string;
  area: string;
  item: string;
  severity: "minor" | "major" | "out_of_service";
  note?: string | null;
};

export type Inspection = {
  id: string;
  user_id: string;
  inspection_type: "pre" | "post";
  vehicle_unit: string | null;
  trailer_unit: string | null;
  odometer: number | null;
  defects: InspectionDefect[];
  defects_correction_required: boolean;
  signature: string | null;
  notes: string | null;
  created_at: string;
};

const DefectSchema = z.object({
  id: z.string().min(1).max(80),
  area: z.string().min(1).max(80),
  item: z.string().min(1).max(120),
  severity: z.enum(["minor", "major", "out_of_service"]),
  note: z.string().max(500).nullable().optional(),
});

const InsertSchema = z.object({
  inspectionType: z.enum(["pre", "post"]),
  vehicleUnit: z.string().max(60).nullable().optional(),
  trailerUnit: z.string().max(60).nullable().optional(),
  odometer: z.number().int().min(0).max(9_999_999).nullable().optional(),
  defects: z.array(DefectSchema).max(200),
  defectsCorrectionRequired: z.boolean(),
  signature: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const createInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof InsertSchema>) => InsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("inspections")
      .insert({
        user_id: userId,
        inspection_type: data.inspectionType,
        vehicle_unit: data.vehicleUnit ?? null,
        trailer_unit: data.trailerUnit ?? null,
        odometer: data.odometer ?? null,
        defects: data.defects,
        defects_correction_required: data.defectsCorrectionRequired,
        signature: data.signature ?? null,
        notes: data.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { inspection: row as unknown as Inspection };
  });

export const listInspections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("inspections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { inspections: (data ?? []) as unknown as Inspection[] };
  });

export const deleteInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("inspections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
