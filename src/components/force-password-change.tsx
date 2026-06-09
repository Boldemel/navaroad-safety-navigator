import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { completePasswordChange } from "@/lib/team.functions";

export function ForcePasswordChange() {
  const qc = useQueryClient();
  const completeFn = useServerFn(completePasswordChange);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (pw.length < 8) throw new Error("Password must be at least 8 characters.");
      if (pw !== confirm) throw new Error("Passwords do not match.");
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      await completeFn();
    },
    onSuccess: () => {
      toast.success("Password updated.");
      qc.invalidateQueries({ queryKey: ["must-change-password"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Set a new password</h1>
            <p className="text-xs text-muted-foreground">
              Your administrator gave you a temporary password. Choose a new one to continue.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label>New password</Label>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label>Confirm new password</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        <Button className="w-full" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Updating…" : "Update password"}
        </Button>
      </Card>
    </div>
  );
}
