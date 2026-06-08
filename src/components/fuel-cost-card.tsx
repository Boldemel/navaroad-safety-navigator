import { useState } from "react";
import { Fuel } from "lucide-react";
import { Label } from "@/components/ui/label";
import { DEFAULT_DIESEL_PRICE, estimateFuel } from "@/lib/fuel-estimator";

export function FuelCostCard({ distanceMi, truck, loaded = true }: { distanceMi: number; truck: string | null; loaded?: boolean }) {
  const [price, setPrice] = useState<number>(DEFAULT_DIESEL_PRICE);
  const { mpg, gallons, cost, costPerMile } = estimateFuel(distanceMi, truck, price, loaded);

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Fuel className="size-4 text-primary" /> Fuel cost estimate
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-muted/40 p-2">
          <div className="text-xs text-muted-foreground">Gallons</div>
          <div className="font-semibold">{gallons.toFixed(1)}</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="font-semibold">${cost.toFixed(2)}</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-xs text-muted-foreground">$/mile</div>
          <div className="font-semibold">${costPerMile.toFixed(3)}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Label htmlFor="diesel-price" className="text-xs">Diesel $/gal</Label>
        <input
          id="diesel-price"
          type="number"
          step="0.01"
          min="0"
          max="20"
          value={price}
          onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
          className="w-20 h-7 rounded border border-input bg-background px-2 text-sm"
        />
        <span>· assumed {mpg.toFixed(1)} mpg ({truck || "default"}{loaded ? ", loaded" : ", empty"})</span>
      </div>
    </div>
  );
}
