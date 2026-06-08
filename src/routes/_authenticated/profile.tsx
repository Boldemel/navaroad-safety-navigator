import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { User, Trash2 } from "lucide-react";
import { VoiceSettingsCard } from "@/components/voice-settings-card";
import { TruckProfileCard } from "@/components/truck-profile-card";
import { FavoriteLocationsCard } from "@/components/favorite-locations-card";
import { SavedRoutesCard } from "@/components/saved-routes-card";
import { deleteOwnAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  component: Profile,
});

function Profile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const deleteAccountFn = useServerFn(deleteOwnAccount);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({
    driver_name: "",
    notify_email: true,
    notify_push: true,
    notify_sms: false,
  });

  async function deleteAccount() {
    setDeleting(true);
    try {
      await deleteAccountFn({});
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Your account has been deleted.");
      router.navigate({ to: "/", replace: true });
    } catch (e) {
      setDeleting(false);
      toast.error(e instanceof Error ? e.message : "Could not delete account.");
    }
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) {
        setForm({
          driver_name: data.driver_name ?? "",
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

        <p className="text-xs text-muted-foreground">Truck, trailer, dimensions, and load status are managed in the Truck Profile below.</p>


        <div className="pt-4 border-t border-border space-y-4">
          <div className="font-medium">Notification preferences</div>
          <Toggle label="Email alerts" checked={form.notify_email} onChange={(v) => setForm({ ...form, notify_email: v })} />
          <Toggle label="Push notifications" checked={form.notify_push} onChange={(v) => setForm({ ...form, notify_push: v })} />
          <Toggle label="SMS for critical alerts" checked={form.notify_sms} onChange={(v) => setForm({ ...form, notify_sms: v })} />
        </div>

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Saving…" : "Save profile"}</Button>
      </form>

      <TruckProfileCard />
      <FavoriteLocationsCard />
      <SavedRoutesCard />
      <VoiceSettingsCard />

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <div>
          <div className="font-medium text-destructive">Delete account</div>
          <p className="text-xs text-muted-foreground mt-1">
            Permanently removes your profile, saved routes, favorites, and sign-in credentials.
            Hazard reports you submitted stay visible to the community but are detached from your account.
            This cannot be undone.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={deleting}>
              <Trash2 className="size-4 mr-1.5" />
              {deleting ? "Deleting…" : "Delete my account"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your Navaroad account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your profile, saved routes, favorites, truck profile, and sign-in.
                You'll be signed out immediately. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Yes, delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
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
