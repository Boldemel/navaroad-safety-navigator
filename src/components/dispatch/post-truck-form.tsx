/**
 * Post Truck Availability form (Dispatch module).
 * Rork-portable: uses shared UI primitives + flex layouts.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DispatchSection, EmptyRow } from "./dispatch-section";
import {
  createTruckAvailability,
  deleteTruckAvailability,
  listTruckAvailability,
  updateTruckAvailabilityStatus,
  type TruckAvailabilityPost,
} from "@/lib/dispatch-extras.functions";
import type { DispatchDriver, DispatchTruck } from "@/lib/dispatch.functions";

const EQUIPMENT_TYPES = [
  "Dry Van",
  "Reefer",
  "Flatbed",
  "Step Deck",
  "Lowboy",
  "Tanker",
  "Hotshot",
  "Power Only",
  "Box Truck",
  "Other",
];
const TRAILER_TYPES = [
  "53' Van",
  "48' Van",
  "53' Reefer",
  "48' Flatbed",
  "53' Flatbed",
  "Step Deck",
  "RGN / Lowboy",
  "Tanker",
  "Container Chassis",
  "Other",
];

export function PostTruckSection({
  drivers,
  trucks,
}: {
  drivers: DispatchDriver[];
  trucks: DispatchTruck[];
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTruckAvailability);
  const delFn = useServerFn(deleteTruckAvailability);
  const statusFn = useServerFn(updateTruckAvailabilityStatus);
  const { data } = useQuery({
    queryKey: ["dispatch", "truck-availability"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });
  const posts = data?.posts ?? [];
  const active = posts.filter((p) => p.status === "active");

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Truck removed");
      qc.invalidateQueries({ queryKey: ["dispatch", "truck-availability"] });
    },
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: TruckAvailabilityPost["status"] }) =>
      statusFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch", "truck-availability"] });
    },
  });

  return (
    <DispatchSection
      title="Truck Availability"
      icon={Truck}
      count={active.length}
      action={<PostTruckDialog drivers={drivers} trucks={trucks} />}
    >
      {active.length === 0 ? (
        <EmptyRow>No trucks posted. Click “Post truck” to list one.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {active.map((p) => (
            <li
              key={p.id}
              className="rounded-md border bg-background p-2.5 text-sm space-y-1"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    Truck {p.vehicleUnit}
                    {p.driverName ? (
                      <span className="text-muted-foreground font-normal">
                        {" · "}
                        {p.driverName}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.originCity || p.originState
                      ? `${p.originCity ?? ""}${p.originCity && p.originState ? ", " : ""}${p.originState ?? ""}`
                      : "Origin: TBD"}
                    {p.availableFrom
                      ? ` · avail ${new Date(p.availableFrom).toLocaleDateString()}`
                      : ""}
                    {p.availableTo
                      ? ` → ${new Date(p.availableTo).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() =>
                    setStatus.mutate({ id: p.id, status: "booked" })
                  }
                >
                  Book
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive"
                  onClick={() => del.mutate(p.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.equipmentType ? (
                  <span className="text-[10px] uppercase tracking-wider rounded bg-primary/10 text-primary px-1.5 py-0.5">
                    {p.equipmentType}
                  </span>
                ) : null}
                {p.trailerType ? (
                  <span className="text-[10px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5">
                    {p.trailerType}
                  </span>
                ) : null}
                {p.maxDeadheadMi != null ? (
                  <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                    ≤ {p.maxDeadheadMi} mi DH
                  </span>
                ) : null}
                {p.minRateUsd != null ? (
                  <span className="text-[10px] rounded bg-success/10 text-success px-1.5 py-0.5">
                    Min ${p.minRateUsd.toFixed(0)}
                  </span>
                ) : null}
                {p.minRatePerMile != null ? (
                  <span className="text-[10px] rounded bg-success/10 text-success px-1.5 py-0.5">
                    ≥ ${p.minRatePerMile.toFixed(2)}/mi
                  </span>
                ) : null}
              </div>
              {p.preferredLanes ? (
                <div className="text-[11px] text-muted-foreground truncate">
                  Lanes: {p.preferredLanes}
                </div>
              ) : null}
              {p.notes ? (
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.notes}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </DispatchSection>
  );
}

function PostTruckDialog({
  drivers,
  trucks,
}: {
  drivers: DispatchDriver[];
  trucks: DispatchTruck[];
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createTruckAvailability);
  const [open, setOpen] = useState(false);
  const [vehicleUnit, setVehicleUnit] = useState("");
  const [driverId, setDriverId] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [originState, setOriginState] = useState("");
  const [availableTo, setAvailableTo] = useState("");
  const [preferredLanes, setPreferredLanes] = useState("");
  const [maxDeadhead, setMaxDeadhead] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [trailerType, setTrailerType] = useState("");
  const [minRateUsd, setMinRateUsd] = useState("");
  const [minRpm, setMinRpm] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setVehicleUnit("");
    setDriverId("");
    setOriginCity("");
    setOriginState("");
    setAvailableTo("");
    setPreferredLanes("");
    setMaxDeadhead("");
    setEquipmentType("");
    setTrailerType("");
    setMinRateUsd("");
    setMinRpm("");
    setNotes("");
  }

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          vehicleUnit: vehicleUnit.trim(),
          driverId: driverId || null,
          availableTo: availableTo
            ? new Date(availableTo).toISOString()
            : null,
          originCity: originCity || null,
          originState: originState || null,
          preferredLanes: preferredLanes || null,
          maxDeadheadMi: maxDeadhead ? Number(maxDeadhead) : null,
          equipmentType: equipmentType || null,
          trailerType: trailerType || null,
          minRateUsd: minRateUsd ? Number(minRateUsd) : null,
          minRatePerMile: minRpm ? Number(minRpm) : null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Truck posted");
      qc.invalidateQueries({ queryKey: ["dispatch", "truck-availability"] });
      reset();
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to post"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
          <Plus className="size-3.5 mr-1" /> Post truck
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Post truck availability</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Truck / Unit *</Label>
            {trucks.length > 0 ? (
              <Select value={vehicleUnit} onValueChange={setVehicleUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Select truck" />
                </SelectTrigger>
                <SelectContent>
                  {trucks.map((t) => (
                    <SelectItem key={t.vehicleUnit} value={t.vehicleUnit}>
                      Truck {t.vehicleUnit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={vehicleUnit}
                onChange={(e) => setVehicleUnit(e.target.value)}
                placeholder="Unit #"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Driver</Label>
            <Select
              value={driverId || "none"}
              onValueChange={(v) => setDriverId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.userId} value={d.userId}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Origin city</Label>
            <Input
              value={originCity}
              onChange={(e) => setOriginCity(e.target.value)}
              placeholder="City"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Origin state</Label>
            <Input
              value={originState}
              onChange={(e) => setOriginState(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="ST"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Available until</Label>
            <Input
              type="datetime-local"
              value={availableTo}
              onChange={(e) => setAvailableTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max deadhead (mi)</Label>
            <Input
              inputMode="numeric"
              value={maxDeadhead}
              onChange={(e) =>
                setMaxDeadhead(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="150"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Equipment type</Label>
            <Select value={equipmentType} onValueChange={setEquipmentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Trailer type</Label>
            <Select value={trailerType} onValueChange={setTrailerType}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {TRAILER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Min rate (USD)</Label>
            <Input
              inputMode="decimal"
              value={minRateUsd}
              onChange={(e) => setMinRateUsd(e.target.value)}
              placeholder="1800"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Min $/mile</Label>
            <Input
              inputMode="decimal"
              value={minRpm}
              onChange={(e) => setMinRpm(e.target.value)}
              placeholder="2.25"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Preferred lanes</Label>
            <Input
              value={preferredLanes}
              onChange={(e) => setPreferredLanes(e.target.value)}
              placeholder="e.g. TX → CA, Midwest → Southeast"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything brokers should know"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!vehicleUnit.trim() || create.isPending}
          >
            {create.isPending ? "Posting…" : "Post truck"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
