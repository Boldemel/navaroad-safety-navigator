import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
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
import { User, Trash2, KeyRound } from "lucide-react";
import { deleteOwnAccount } from "@/lib/account.functions";
import { useBrowserNotifications } from "@/hooks/use-browser-notifications";

export const Route = createFileRoute("/_authenticated/profile")({
  component: Profile,
});

function Profile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const deleteAccountFn = useServerFn(deleteOwnAccount);
  const { supported: notifSupported, permission: notifPermission, request: requestNotif } = useBrowserNotifications();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [email, setEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [form, setForm] = useState({
    display_name: "",
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
      const { data } = await supabase.from("profiles").select("driver_name, notify_email, notify_push, notify_sms").eq("id", u.user.id).maybeSingle();
      if (data) {
        setForm({
          display_name: data.driver_name ?? "",
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
    const payload = {
      id: u.user.id,
      driver_name: form.display_name,
      notify_email: form.notify_email,
      notify_push: form.notify_push,
      notify_sms: form.notify_sms,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("profiles").upsert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) return toast.error("Password must be at least 8 characters.");
    if (newPw !== confirmPw) return toast.error("Passwords do not match.");
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setChangingPw(false);
    if (error) return toast.error(error.message);
    setNewPw(""); setConfirmPw("");
    toast.success("Password updated.");
  }

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <User className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{form.display_name || "Your account"}</h1>
          <p className="text-muted-foreground text-sm">{email}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
        Driver info, truck profile, pay setup, routes, and team members live on the{" "}
        <Link to="/company" className="font-medium text-primary hover:underline">Company &amp; Team</Link> page.
      </div>

      <form onSubmit={save} className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="font-medium">Account</div>
        <div className="space-y-1.5">
          <Label>Your name</Label>
          <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={email} disabled />
          <p className="text-[11px] text-muted-foreground">Contact support to change your sign-in email.</p>
        </div>

        <div className="pt-4 border-t border-border space-y-4">
          <div className="font-medium">Notification preferences</div>
          <Toggle label="Email alerts" checked={form.notify_email} onChange={(v) => setForm({ ...form, notify_email: v })} />
          <Toggle label="Push notifications" checked={form.notify_push} onChange={(v) => setForm({ ...form, notify_push: v })} />
          <Toggle label="SMS for critical alerts" checked={form.notify_sms} onChange={(v) => setForm({ ...form, notify_sms: v })} />
          {form.notify_push && notifSupported && (
            <div className="flex items-center justify-between text-xs rounded-md border border-border bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">
                Browser notifications:{" "}
                <span className={notifPermission === "granted" ? "text-primary font-medium" : "text-foreground"}>
                  {notifPermission === "granted" ? "enabled" : notifPermission === "denied" ? "blocked in browser settings" : "permission needed"}
                </span>
              </span>
              {notifPermission !== "granted" && notifPermission !== "denied" && (
                <Button type="button" size="sm" variant="outline" onClick={() => requestNotif()}>
                  Enable
                </Button>
              )}
            </div>
          )}
        </div>

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Saving…" : "Save"}</Button>
      </form>

      <form onSubmit={changePassword} className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 font-medium"><KeyRound className="size-4" /> Change password</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new password</Label>
            <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <Button type="submit" disabled={changingPw || !newPw} className="w-full sm:w-auto">
          {changingPw ? "Updating…" : "Update password"}
        </Button>
      </form>

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
