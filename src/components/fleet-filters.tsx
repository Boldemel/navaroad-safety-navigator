import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFleetFilterOptions } from "@/lib/fleet-filters.functions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type FleetFilterValue = {
  truck: string;       // "" = all
  driverId: string;    // "" = all
  from: string;        // YYYY-MM-DD, "" = none
  to: string;          // YYYY-MM-DD, "" = none
};

export const emptyFleetFilters: FleetFilterValue = { truck: "", driverId: "", from: "", to: "" };

type Props = {
  value: FleetFilterValue;
  onChange: (v: FleetFilterValue) => void;
  showDriver?: boolean;
  showTruck?: boolean;
  showDates?: boolean;
  className?: string;
};

/**
 * Compact filter strip for list pages: Truck · Driver · Date range.
 * Pages own the actual filtering logic; this just collects user input.
 */
export function FleetFilters({
  value,
  onChange,
  showDriver = true,
  showTruck = true,
  showDates = true,
  className,
}: Props) {
  const fetchOpts = useServerFn(listFleetFilterOptions);
  const { data } = useQuery({
    queryKey: ["fleet-filter-options"],
    queryFn: () => fetchOpts(),
    staleTime: 60_000,
  });

  const set = (patch: Partial<FleetFilterValue>) => onChange({ ...value, ...patch });
  const isActive = !!(value.truck || value.driverId || value.from || value.to);

  return (
    <div
      className={
        "flex flex-wrap items-end gap-2 rounded-md border border-border bg-card/50 p-2 " +
        (className ?? "")
      }
    >
      {showTruck && (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Truck</Label>
          <select
            value={value.truck}
            onChange={(e) => set({ truck: e.target.value })}
            className="block h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[110px]"
          >
            <option value="">All trucks</option>
            {(data?.trucks ?? []).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      {showDriver && (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Driver</Label>
          <select
            value={value.driverId}
            onChange={(e) => set({ driverId: e.target.value })}
            className="block h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[130px]"
          >
            <option value="">All drivers</option>
            {(data?.drivers ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {showDates && (
        <>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</Label>
            <Input
              type="date"
              value={value.from}
              onChange={(e) => set({ from: e.target.value })}
              className="h-9 w-[145px]"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
            <Input
              type="date"
              value={value.to}
              onChange={(e) => set({ to: e.target.value })}
              className="h-9 w-[145px]"
            />
          </div>
        </>
      )}

      {isActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => onChange(emptyFleetFilters)}
        >
          <X className="size-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
