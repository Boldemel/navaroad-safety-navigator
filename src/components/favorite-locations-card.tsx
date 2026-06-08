import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { FAVORITE_CATEGORIES, favoriteCategoryLabel } from "@/lib/favorite-locations";
import { AddressAutocomplete, type SelectedPlace } from "@/components/address-autocomplete";

export function useFavoriteLocations() {
  return useQuery({
    queryKey: ["favorite-locations"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("favorite_locations")
        .select("*")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function FavoriteLocationsCard() {
  const qc = useQueryClient();
  const { data: favorites = [], isLoading } = useFavoriteLocations();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("home_terminal");
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (place && address !== place.label) setPlace(null);
  }, [address, place]);

  async function add() {
    if (!label.trim()) return toast.error("Enter a label (e.g. Main Yard).");
    if (!place) return toast.error("Pick an address from the suggestions.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { data: cm } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", u.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!cm?.company_id) { setSaving(false); return toast.error("No company found."); }
    const { error } = await supabase.from("favorite_locations").insert({
      user_id: u.user.id,
      company_id: cm.company_id,
      label: label.trim(),
      category,
      address: place.label,
      latitude: place.lat,
      longitude: place.lon,
      city: place.city,
      state: place.state,
      country: place.country,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setLabel("");
    setAddress("");
    setPlace(null);
    toast.success("Location saved.");
    qc.invalidateQueries({ queryKey: ["favorite-locations"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("favorite_locations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["favorite-locations"] });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Star className="size-4 text-warning" />
        <h2 className="font-semibold">Favorite Locations</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Saved locations appear as suggestions when picking an Origin or Destination.
      </p>

      <div className="grid sm:grid-cols-[1fr_220px] gap-3">
        <div className="space-y-1.5">
          <Label>Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main Yard" />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FAVORITE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <AddressAutocomplete
          value={address}
          onChange={setAddress}
          onSelect={setPlace}
          placeholder="123 Industrial Blvd, Dallas, TX"
        />
      </div>
      <Button type="button" onClick={add} disabled={saving} className="w-full sm:w-auto">
        <Plus className="size-4 mr-1" />{saving ? "Saving…" : "Save Location"}
      </Button>

      <div className="pt-2 border-t border-border">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading saved locations…</div>
        ) : favorites.length === 0 ? (
          <div className="text-sm text-muted-foreground">No saved locations yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {favorites.map((f) => (
              <li key={f.id} className="py-2 flex items-start gap-3">
                <Star className="size-4 text-warning mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {favoriteCategoryLabel(f.category)} · {f.address}
                  </div>
                </div>
                <button
                  onClick={() => remove(f.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
