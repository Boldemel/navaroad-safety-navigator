import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReminderSeverity = "overdue" | "soon" | "upcoming";
export type Reminder = {
  id: string;
  title: string;
  detail: string;
  dueDate: string; // ISO date
  daysUntil: number;
  severity: ReminderSeverity;
  to: string; // route to navigate to
};

function daysBetween(iso: string): number {
  const due = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / 86400000);
}

function severityFor(days: number): ReminderSeverity {
  if (days < 0) return "overdue";
  if (days <= 14) return "soon";
  return "upcoming";
}

const HORIZON_DAYS = 45;

export function useReminders() {
  return useQuery({
    queryKey: ["reminders"],
    queryFn: async (): Promise<Reminder[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return [];

      const [profileRes, docsRes, maintRes, inspRes] = await Promise.all([
        supabase.from("profiles").select(
          "truck_registration_expiry, truck_insurance_expiry, trailer_registration_expiry, trailer_insurance_expiry"
        ).eq("id", uid).maybeSingle(),
        supabase.from("documents").select("id, title, doc_type, expires_on").eq("user_id", uid),
        supabase.from("maintenance_records").select("id, service_type, next_due_date").eq("user_id", uid).not("next_due_date", "is", null),
        supabase.from("inspections").select("id, vehicle_unit, defects_correction_required, created_at").eq("user_id", uid).eq("defects_correction_required", true),
      ]);

      const reminders: Reminder[] = [];

      const p = profileRes.data;
      const pushExpiry = (label: string, date: string | null | undefined, to: string) => {
        if (!date) return;
        const d = daysBetween(date);
        if (d > HORIZON_DAYS) return;
        reminders.push({
          id: `${to}-${label}`,
          title: label,
          detail: d < 0 ? `Expired ${Math.abs(d)}d ago` : `Due in ${d}d (${date})`,
          dueDate: date,
          daysUntil: d,
          severity: severityFor(d),
          to,
        });
      };
      if (p) {
        pushExpiry("Truck registration", p.truck_registration_expiry, "/profile");
        pushExpiry("Truck insurance", p.truck_insurance_expiry, "/profile");
        pushExpiry("Trailer registration", p.trailer_registration_expiry, "/profile");
        pushExpiry("Trailer insurance", p.trailer_insurance_expiry, "/profile");
      }

      (docsRes.data ?? []).forEach((doc) => {
        if (!doc.expires_on) return;
        const d = daysBetween(doc.expires_on);
        if (d > HORIZON_DAYS) return;
        reminders.push({
          id: `doc-${doc.id}`,
          title: doc.title || doc.doc_type,
          detail: d < 0 ? `Expired ${Math.abs(d)}d ago` : `Expires in ${d}d`,
          dueDate: doc.expires_on,
          daysUntil: d,
          severity: severityFor(d),
          to: "/documents",
        });
      });

      (maintRes.data ?? []).forEach((m: any) => {
        const d = daysBetween(m.next_due_date);
        if (d > HORIZON_DAYS) return;
        reminders.push({
          id: `maint-${m.id}`,
          title: `Maintenance: ${m.service_type}`,
          detail: d < 0 ? `Overdue ${Math.abs(d)}d` : `Due in ${d}d`,
          dueDate: m.next_due_date,
          daysUntil: d,
          severity: severityFor(d),
          to: "/maintenance",
        });
      });

      (inspRes.data ?? []).forEach((i: any) => {
        reminders.push({
          id: `dvir-${i.id}`,
          title: `Open DVIR defect${i.vehicle_unit ? ` — ${i.vehicle_unit}` : ""}`,
          detail: "Awaiting correction",
          dueDate: i.created_at,
          daysUntil: -1,
          severity: "overdue",
          to: "/inspections",
        });
      });

      return reminders.sort((a, b) => a.daysUntil - b.daysUntil);
    },
    staleTime: 60_000,
  });
}
