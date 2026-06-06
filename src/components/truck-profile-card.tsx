import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRUCK_TYPES, TRAILER_TYPES } from "@/lib/navaroad";
import { Truck } from "lucide-react";
import { toast } from "sonner";

type TruckProfile = {
  truck_type: string;
  trailer_type: string;
  truck_height_in: string;
  truck_weight_lbs: string;
  truck_length_ft: string;
  truck_axles: string;
  truck_hazmat: boolean;
  load_status: string;
};

const EMPTY: TruckProfile = {
  truck_type: "Sleeper",
  trailer_type: "Dry Van",
  truck_height_in: "",
  truck_weight_lbs: "",
  truck_length_ft: "",
  truck_axles: "",
  truck_hazmat: false,
  load_status: "empty",
};

export function TruckProfileCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TruckProfile>(EMPTY);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) {
        setForm({
          truck_type: data.truck_type ?? "Sleeper",
          trailer_type: data.trailer_type ?? "Dry Van",
          truck_height_in: data.truck_height_in != null ? String(data.truck_height_in) : "",
          truck_weight_lbs: data.truck_weight_lbs != null ? String(data.truck_weight_lbs) : "",
          truck_length_ft: data.truck_length_ft != null ? String(data.truck_length_ft) : "",
          truck_axles: data.truck_axles != null ? String(data.truck_axles) : "",
          truck_hazmat: !!data.truck_hazmat,
          load_status: data.load_status ?? "empty",
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
    const toNum = (s: string) => (s.trim() === "" ? null : Number(s));
    const { error } = await supabase.from("profiles").upsert({
      id: u.user.id,
      truck_type: form.truck_type,
      trailer_type: form.trailer_type,
      truck_height_in: toNum(form.truck_height_in),
      truck_weight_lbs: toNum(form.truck_weight_lbs),
      truck_length_ft: toNum(form.truck_length_ft),
      truck_axles: form.truck_axles.trim() === "" ? null : Math.round(Number(form.truck_axles)),
      truck_hazmat: form.truck_hazmat,
      load_status: form.load_status,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Truck profile saved. Route analysis will use these values.");
  }

  if (loading) return null;

  return (
    <form onSubmit={save} className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Truck className="size-4 text-primary" />
        <h2 className="font-semibold">Truck Profile</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        Used by Route Analysis to flag truck restriction risk. Live bridge/weight/hazmat verification data is not connected yet.
      </p>

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
        <div className="space-y-1.5">
          <Label>Truck height (inches)</Label>
          <Input type="number" inputMode="decimal" min={0} step="0.1" placeholder="162"
            value={form.truck_height_in}
            onChange={(e) => setForm({ ...form, truck_height_in: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Truck weight (lbs)</Label>
          <Input type="number" inputMode="numeric" min={0} step="100" placeholder="80000"
            value={form.truck_weight_lbs}
            onChange={(e) => setForm({ ...form, truck_weight_lbs: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Truck length (feet)</Label>
          <Input type="number" inputMode="decimal" min={0} step="0.5" placeholder="70"
            value={form.truck_length_ft}
            onChange={(e) => setForm({ ...form, truck_length_ft: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Number of axles</Label>
          <Input type="number" inputMode="numeric" min={2} max={12} step="1" placeholder="5"
            value={form.truck_axles}
            onChange={(e) => setForm({ ...form, truck_axles: e.target.value })} />
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
        </div>
        <div className="flex items-center justify-between rounded-md border border-border bg-background px-3">
          <Label className="m-0">Hazmat load</Label>
          <Switch checked={form.truck_hazmat} onCheckedChange={(v) => setForm({ ...form, truck_hazmat: v })} />
        </div>
      </div>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? "Saving…" : "Save Truck Profile"}
      </Button>
    </form>
  );
}
