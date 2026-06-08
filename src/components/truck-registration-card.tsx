import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileBadge, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Form = {
  truck_vin: string;
  truck_plate: string;
  truck_plate_state: string;
  truck_make: string;
  truck_model: string;
  truck_year: string;
  truck_registration_expiry: string;
  truck_insurance_carrier: string;
  truck_insurance_policy: string;
  truck_insurance_expiry: string;
  trailer_vin: string;
  trailer_plate: string;
  trailer_plate_state: string;
  trailer_make: string;
  trailer_year: string;
  trailer_registration_expiry: string;
  trailer_insurance_expiry: string;
};

const EMPTY: Form = {
  truck_vin: "", truck_plate: "", truck_plate_state: "", truck_make: "", truck_model: "", truck_year: "",
  truck_registration_expiry: "", truck_insurance_carrier: "", truck_insurance_policy: "", truck_insurance_expiry: "",
  trailer_vin: "", trailer_plate: "", trailer_plate_state: "", trailer_make: "", trailer_year: "",
  trailer_registration_expiry: "", trailer_insurance_expiry: "",
};

function daysUntil(d: string): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

function ExpiryPill({ date, label }: { date: string; label: string }) {
  const days = daysUntil(date);
  if (days === null) return null;
  const cls = days < 0
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : days <= 14
      ? "bg-warning/15 text-warning border-warning/30"
      : days <= 45
        ? "bg-muted text-muted-foreground border-border"
        : "bg-success/10 text-success border-success/30";
  const text = days < 0 ? `${label} EXPIRED ${Math.abs(days)}d ago` : days === 0 ? `${label} expires today` : `${label} in ${days}d`;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border", cls)}>
      {days <= 14 && <AlertTriangle className="size-3" />} {text}
    </span>
  );
}

export function TruckRegistrationCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) {
        const d = data as unknown as Record<string, unknown>;
        const s = (k: string) => (d[k] == null ? "" : String(d[k]));
        setForm({
          truck_vin: s("truck_vin"), truck_plate: s("truck_plate"), truck_plate_state: s("truck_plate_state"),
          truck_make: s("truck_make"), truck_model: s("truck_model"), truck_year: s("truck_year"),
          truck_registration_expiry: s("truck_registration_expiry"),
          truck_insurance_carrier: s("truck_insurance_carrier"), truck_insurance_policy: s("truck_insurance_policy"),
          truck_insurance_expiry: s("truck_insurance_expiry"),
          trailer_vin: s("trailer_vin"), trailer_plate: s("trailer_plate"), trailer_plate_state: s("trailer_plate_state"),
          trailer_make: s("trailer_make"), trailer_year: s("trailer_year"),
          trailer_registration_expiry: s("trailer_registration_expiry"),
          trailer_insurance_expiry: s("trailer_insurance_expiry"),
        });
      }
      setLoading(false);
    })();
  }, []);

  const pills = useMemo(() => [
    { d: form.truck_registration_expiry, l: "Truck reg." },
    { d: form.truck_insurance_expiry, l: "Truck ins." },
    { d: form.trailer_registration_expiry, l: "Trailer reg." },
    { d: form.trailer_insurance_expiry, l: "Trailer ins." },
  ].filter((p) => p.d), [form]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const payload: Record<string, unknown> = {
      id: u.user.id,
      updated_at: new Date().toISOString(),
    };
    for (const [k, v] of Object.entries(form)) {
      if (k.endsWith("_year")) payload[k] = v ? parseInt(v, 10) : null;
      else if (k.endsWith("_expiry")) payload[k] = v || null;
      else payload[k] = v.trim() === "" ? null : v.trim();
    }
    const { error } = await supabase.from("profiles").upsert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Truck & trailer details saved.");
  }

  if (loading) return null;

  return (
    <form onSubmit={save} className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <FileBadge className="size-4 text-primary" />
        <h2 className="font-semibold">Registration & Insurance</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        VIN, plate, registration and insurance details for your truck and trailer. Expiry dates power reminder alerts.
      </p>

      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((p) => <ExpiryPill key={p.l} date={p.d} label={p.l} />)}
        </div>
      )}

      {/* TRUCK */}
      <div className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Truck</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="VIN"><Input value={form.truck_vin} onChange={(e) => setForm({ ...form, truck_vin: e.target.value.toUpperCase() })} maxLength={17} placeholder="17 chars" /></Field>
          <Field label="Plate"><Input value={form.truck_plate} onChange={(e) => setForm({ ...form, truck_plate: e.target.value.toUpperCase() })} maxLength={12} /></Field>
          <Field label="Plate state (2-letter)"><Input value={form.truck_plate_state} onChange={(e) => setForm({ ...form, truck_plate_state: e.target.value.toUpperCase() })} maxLength={2} placeholder="TX" /></Field>
          <Field label="Year"><Input type="number" min={1950} max={2100} value={form.truck_year} onChange={(e) => setForm({ ...form, truck_year: e.target.value })} /></Field>
          <Field label="Make"><Input value={form.truck_make} onChange={(e) => setForm({ ...form, truck_make: e.target.value })} maxLength={60} placeholder="Freightliner" /></Field>
          <Field label="Model"><Input value={form.truck_model} onChange={(e) => setForm({ ...form, truck_model: e.target.value })} maxLength={60} placeholder="Cascadia" /></Field>
          <Field label="Registration expires"><Input type="date" value={form.truck_registration_expiry} onChange={(e) => setForm({ ...form, truck_registration_expiry: e.target.value })} /></Field>
          <Field label="Insurance carrier"><Input value={form.truck_insurance_carrier} onChange={(e) => setForm({ ...form, truck_insurance_carrier: e.target.value })} maxLength={120} /></Field>
          <Field label="Insurance policy #"><Input value={form.truck_insurance_policy} onChange={(e) => setForm({ ...form, truck_insurance_policy: e.target.value })} maxLength={80} /></Field>
          <Field label="Insurance expires"><Input type="date" value={form.truck_insurance_expiry} onChange={(e) => setForm({ ...form, truck_insurance_expiry: e.target.value })} /></Field>
        </div>
      </div>

      {/* TRAILER */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trailer</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="VIN"><Input value={form.trailer_vin} onChange={(e) => setForm({ ...form, trailer_vin: e.target.value.toUpperCase() })} maxLength={17} /></Field>
          <Field label="Plate"><Input value={form.trailer_plate} onChange={(e) => setForm({ ...form, trailer_plate: e.target.value.toUpperCase() })} maxLength={12} /></Field>
          <Field label="Plate state (2-letter)"><Input value={form.trailer_plate_state} onChange={(e) => setForm({ ...form, trailer_plate_state: e.target.value.toUpperCase() })} maxLength={2} /></Field>
          <Field label="Year"><Input type="number" min={1950} max={2100} value={form.trailer_year} onChange={(e) => setForm({ ...form, trailer_year: e.target.value })} /></Field>
          <Field label="Make"><Input value={form.trailer_make} onChange={(e) => setForm({ ...form, trailer_make: e.target.value })} maxLength={60} placeholder="Great Dane" /></Field>
          <Field label="Registration expires"><Input type="date" value={form.trailer_registration_expiry} onChange={(e) => setForm({ ...form, trailer_registration_expiry: e.target.value })} /></Field>
          <Field label="Insurance expires"><Input type="date" value={form.trailer_insurance_expiry} onChange={(e) => setForm({ ...form, trailer_insurance_expiry: e.target.value })} /></Field>
        </div>
      </div>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
