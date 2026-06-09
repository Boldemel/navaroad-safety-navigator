import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const COMPLIANCE_CATEGORIES = [
  "CDL",
  "Medical",
  "Drug Testing",
  "Employment",
  "Training",
  "Safety",
] as const;

export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export type DriverCategorySummary = {
  total: number;
  expired: number;
  soon: number; // ≤30 days
  missing: boolean; // no doc in category
  earliestExpiry: string | null;
  earliestDaysUntil: number | null;
};

export type DriverComplianceRow = {
  driverId: string;
  driverName: string;
  totalDocs: number;
  expired: number;
  soon: number;
  missingCategories: number;
  complianceScore: number; // 0..100
  categories: Record<ComplianceCategory, DriverCategorySummary>;
};

export type ComplianceMatrix = {
  rows: DriverComplianceRow[];
  totals: {
    drivers: number;
    expired: number;
    soon: number;
    missing: number;
  };
};

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

function emptyCategory(): DriverCategorySummary {
  return { total: 0, expired: 0, soon: 0, missing: true, earliestExpiry: null, earliestDaysUntil: null };
}

export const getDriverComplianceMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ComplianceMatrix> => {
    const supabase = context.supabase;
    const [docsRes, profilesRes] = await Promise.all([
      supabase.from("documents").select("*"),
      supabase.from("profiles").select("id, driver_name, first_name, last_name"),
    ]);
    if (docsRes.error) throw new Error(docsRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const docs = (docsRes.data ?? []) as any[];
    const profiles = (profilesRes.data ?? []) as any[];

    const nameFor = (id: string): string => {
      const p = profiles.find((x) => x.id === id);
      if (!p) return "Unassigned driver";
      return p.driver_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Driver";
    };

    const rowMap = new Map<string, DriverComplianceRow>();
    const newRow = (id: string): DriverComplianceRow => {
      const cats = {} as Record<ComplianceCategory, DriverCategorySummary>;
      for (const c of COMPLIANCE_CATEGORIES) cats[c] = emptyCategory();
      return {
        driverId: id,
        driverName: nameFor(id),
        totalDocs: 0,
        expired: 0,
        soon: 0,
        missingCategories: COMPLIANCE_CATEGORIES.length,
        complianceScore: 100,
        categories: cats,
      };
    };

    // Seed all drivers (even with zero docs) so gaps are visible
    for (const p of profiles) {
      if (!rowMap.has(p.id)) rowMap.set(p.id, newRow(p.id));
    }

    for (const d of docs) {
      const did = (d.driver_id || d.user_id) as string | null;
      if (!did) continue;
      let row = rowMap.get(did);
      if (!row) { row = newRow(did); rowMap.set(did, row); }
      row.totalDocs += 1;

      const cat = (COMPLIANCE_CATEGORIES as readonly string[]).includes(d.category)
        ? (d.category as ComplianceCategory)
        : null;
      if (!cat) continue;

      const slot = row.categories[cat];
      if (slot.missing) {
        slot.missing = false;
        row.missingCategories -= 1;
      }
      slot.total += 1;
      const n = daysUntil(d.expires_on ?? null);
      if (n != null) {
        if (n < 0) { slot.expired += 1; row.expired += 1; }
        else if (n <= 30) { slot.soon += 1; row.soon += 1; }
        if (slot.earliestDaysUntil == null || n < slot.earliestDaysUntil) {
          slot.earliestDaysUntil = n;
          slot.earliestExpiry = d.expires_on ?? null;
        }
      }
    }

    const rows: DriverComplianceRow[] = [];
    for (const r of rowMap.values()) {
      let score = 100;
      if (r.expired > 0) score -= Math.min(50, r.expired * 15);
      if (r.soon > 0) score -= Math.min(20, r.soon * 5);
      if (r.missingCategories > 0) score -= Math.min(30, r.missingCategories * 5);
      r.complianceScore = Math.max(0, score);
      rows.push(r);
    }
    rows.sort((a, b) => a.complianceScore - b.complianceScore);

    return {
      rows,
      totals: {
        drivers: rows.length,
        expired: rows.reduce((a, r) => a + r.expired, 0),
        soon: rows.reduce((a, r) => a + r.soon, 0),
        missing: rows.reduce((a, r) => a + r.missingCategories, 0),
      },
    };
  });
