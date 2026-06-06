import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TRUCK_TYPES, TRAILER_TYPES } from "@/lib/navaroad";
import { toast } from "sonner";
import { User } from "lucide-react";
import { VoiceSettingsCard } from "@/components/voice-settings-card";

export const Route = createFileRoute("/_authenticated/profile")({
  component: Profile,
});

function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({
    driver_name: "",
    truck_type: "Sleeper",
    trailer_type: "Dry Van",
    load_status: "empty",
    notify_email: true,
    notify_push: true,
    notify_sms: false,
  });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) {
        setForm({
          driver_name: data.driver_name ?? "",
          truck_type: data.truck_type ?? "Sleeper",
          trailer_type: data.trailer_type ?? "Dry Van",
          load_status: data.load_status ?? "empty",
          notify_email: data.notify_email ?? true,
          notify_push: data.notify_push ?? true,
          notify_sms: data.notify_sms ?? false,
        });
      }
      setLoading(false);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { error } = await supabase.from("profiles").upsert({ id: u.user.id, ...form, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved.");
  }

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <User className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{form.driver_name || "Driver"}</h1>
          <p className="text-muted-foreground text-sm">{email}</p>
        </div>
      </div>

      <form onSubmit={save} className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="space-y-1.5">
          <Label>Driver name</Label>
          <Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Truck type</Label>
            <Select value={form.truck_type} onValueChange={(v) => setForm({ ...form, truck_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TRUCK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Trailer type</Label>
            <Select value={form.trailer_type} onValueChange={(v) => setForm({ ...form, trailer_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TRAILER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Load status</Label>
          <Select value={form.load_status} onValueChange={(v) => setForm({ ...form, load_status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="loaded">Loaded</SelectItem>
              <SelectItem value="empty">Empty</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Empty trailers get sharper wind-risk warnings.</p>
        </div>

        <div className="pt-4 border-t border-border space-y-4">
          <div className="font-medium">Notification preferences</div>
          <Toggle label="Email alerts" checked={form.notify_email} onChange={(v) => setForm({ ...form, notify_email: v })} />
          <Toggle label="Push notifications" checked={form.notify_push} onChange={(v) => setForm({ ...form, notify_push: v })} />
          <Toggle label="SMS for critical alerts" checked={form.notify_sms} onChange={(v) => setForm({ ...form, notify_sms: v })} />
        </div>

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Saving…" : "Save profile"}</Button>
      </form>

      <VoiceSettingsCard />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
