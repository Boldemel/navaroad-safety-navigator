/**
 * Assignment dialog: single-screen driver + truck + status assignment
 * for a Dispatch load. Reusable — pass a load and the available driver
 * / truck lists.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Truck, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TripTimeline } from "./trip-timeline";
import { DispatchCommsPanel } from "./dispatch-comms-panel";
import {
  assignLoad,
  updateDispatchStatus,
  DISPATCH_STATUSES,
  type DispatchDriver,
  type DispatchLoad,
  type DispatchStatus,
  type DispatchTruck,
} from "@/lib/dispatch.functions";

export function AssignmentDialog({
  open,
  onOpenChange,
  load,
  drivers,
  trucks,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  load: DispatchLoad | null;
  drivers: DispatchDriver[];
  trucks: DispatchTruck[];
}) {
  const qc = useQueryClient();
  const assignFn = useServerFn(assignLoad);
  const statusFn = useServerFn(updateDispatchStatus);

  const [driverId, setDriverId] = useState<string>(load?.driverId ?? "");
  const [vehicleUnit, setVehicleUnit] = useState<string>(load?.vehicleUnit ?? "");
  const [status, setStatus] = useState<DispatchStatus>(load?.dispatchStatus ?? "assigned");

  // Reset local state whenever a new load is opened
  const currentKey = load?.id ?? "";
  const [prevKey, setPrevKey] = useState(currentKey);
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setDriverId(load?.driverId ?? "");
    setVehicleUnit(load?.vehicleUnit ?? "");
    setStatus(load?.dispatchStatus ?? "assigned");
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!load) return;
      await assignFn({
        data: {
          loadId: load.id,
          driverId: driverId || null,
          vehicleUnit: vehicleUnit || null,
        },
      });
      if (status !== "assigned" && status !== load.dispatchStatus) {
        await statusFn({ data: { loadId: load.id, dispatchStatus: status } });
      }
    },
    onSuccess: () => {
      toast.success("Load assigned");
      qc.invalidateQueries({ queryKey: ["dispatch", "snapshot"] });
      onOpenChange(false);
    },
  });

  if (!load) return null;

  const selectedDriver = drivers.find((d) => d.userId === driverId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign load</DialogTitle>
          <DialogDescription>
            {load.bolNumber ? `BOL ${load.bolNumber} · ` : ""}
            {load.shipperName ?? "TBD"} → {load.consigneeName ?? "TBD"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Driver */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <User className="size-3.5" /> Driver
            </label>
            <Select value={driverId || "none"} onValueChange={(v) => setDriverId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.userId} value={d.userId}>
                    {d.name}
                    {d.assignedTruck ? ` · Truck ${d.assignedTruck}` : ""}
                    {d.status !== "available" ? ` (${d.status.replace("_", " ")})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Truck */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Truck className="size-3.5" /> Truck
            </label>
            <Select
              value={vehicleUnit || selectedDriver?.assignedTruck || "none"}
              onValueChange={(v) => setVehicleUnit(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a truck" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No truck —</SelectItem>
                {trucks.map((t) => (
                  <SelectItem key={t.vehicleUnit} value={t.vehicleUnit}>
                    Truck {t.vehicleUnit}
                    {t.status !== "available" ? " (in use)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Trip status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as DispatchStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPATCH_STATUSES.filter((s) => s !== "unassigned").map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
              Timeline preview
            </div>
            <TripTimeline status={status} onSelect={(s) => setStatus(s)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4 mr-1" /> Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
