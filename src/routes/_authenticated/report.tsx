import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HAZARD_TYPES, SEVERITIES } from "@/lib/navaroad";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/report")({
  component: ReportHazard,
});

function ReportHazard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [hazardType, setHazardType] = useState("accident");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [submitted, setSubmitted] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("You must be signed in to report a hazard.");
      const { error } = await supabase.from("hazard_reports").insert({
        hazard_type: hazardType,
        location,
        description,
        severity,
        reporter_id: u.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Hazard reported. Thanks for keeping drivers safe.");
      qc.invalidateQueries({ queryKey: ["dash-hazards"] });
      qc.invalidateQueries({ queryKey: ["map-hazards"] });
      qc.invalidateQueries({ queryKey: ["alerts-hazards"] });
      setSubmitted(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() {
    setHazardType("accident");
    setLocation("");
    setDescription("");
    setSeverity("medium");
    setSubmitted(false);
    submit.reset();
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Report a Hazard</h1>
        <p className="text-muted-foreground text-sm">Help other drivers avoid what you just saw.</p>
      </div>

      {submitted ? (
        <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center space-y-4">
          <CheckCircle2 className="size-12 text-success mx-auto" />
          <div>
            <h2 className="text-lg font-semibold">Report submitted</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your hazard is now visible to other Navaroad drivers on the map and Alerts Center.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button onClick={() => navigate({ to: "/hazard-map" })}>View on map</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/alerts" })}>Open Alerts Center</Button>
            <Button variant="ghost" onClick={reset}>Report another</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
          className="rounded-xl border border-border bg-card p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm text-primary">
            <AlertTriangle className="size-4" />
            Reports are visible to all Navaroad drivers
          </div>

          <div className="space-y-1.5">
            <Label>Hazard type</Label>
            <Select value={hazardType} onValueChange={setHazardType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HAZARD_TYPES.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="I-80 EB, MP 215, WY" />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did you see?" />
          </div>

          <div className="space-y-1.5">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {submit.isError && (
            <div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">
              {(submit.error as Error).message}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit report"}
          </Button>
        </form>
      )}
    </div>
  );
}
