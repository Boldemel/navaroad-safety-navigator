import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserCompanyId } from "./get-company";

export type WalletDoc = {
  id: string;
  user_id: string;
  doc_type: string;
  title: string;
  issuer: string | null;
  doc_number: string | null;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  file_url: string | null;
  created_at: string;
  updated_at: string;
};

const DocSchema = z.object({
  docType: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  issuer: z.string().max(200).nullable().optional(),
  docNumber: z.string().max(80).nullable().optional(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  fileUrl: z.string().url().max(2000).nullable().optional(),
  category: z.string().max(40).nullable().optional(),
  driverId: z.string().uuid().nullable().optional(),
});

function row(d: z.infer<typeof DocSchema>) {
  return {
    doc_type: d.docType,
    title: d.title,
    issuer: d.issuer ?? null,
    doc_number: d.docNumber ?? null,
    issued_on: d.issuedOn ?? null,
    expires_on: d.expiresOn ?? null,
    notes: d.notes ?? null,
    file_url: d.fileUrl ?? null,
    category: d.category ?? null,
    driver_id: d.driverId ?? null,
  };
}

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("documents")
      .select("*")
      .order("expires_on", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { docs: (data ?? []) as unknown as WalletDoc[] };
  });

export const createDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof DocSchema>) => DocSchema.parse(d))
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase.from("documents").insert({ user_id: context.userId, company_id: companyId, ...row(data) });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & z.infer<typeof DocSchema>) =>
    z.object({ id: z.string().uuid() }).extend(DocSchema.shape).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("documents").update(row(rest)).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
