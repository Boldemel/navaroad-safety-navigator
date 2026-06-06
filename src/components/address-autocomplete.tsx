import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchAddresses, type AddressSuggestion } from "@/lib/geo-search.functions";

export type SelectedPlace = {
  label: string;
  lat: number;
  lon: number;
  city: string | null;
  state: string | null;
  country: string | null;
};

export type FavoriteSuggestion = SelectedPlace & {
  id: string;
  categoryLabel: string;
  customLabel: string;
};

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSelect: (place: SelectedPlace) => void;
  placeholder?: string;
  required?: boolean;
  proximity?: { lat: number; lon: number } | null;
  inputId?: string;
  favorites?: FavoriteSuggestion[];
};


export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  required,
  proximity,
  inputId,
}: Props) {
  const searchFn = useServerFn(searchAddresses);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [hi, setHi] = useState(0);
  const [skipNext, setSkipNext] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (skipNext) {
      setSkipNext(false);
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchFn({
          data: {
            query: q,
            ...(proximity ? { lat: proximity.lat, lon: proximity.lon } : {}),
          },
        });
        setResults(r);
        setHi(0);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function pick(s: AddressSuggestion) {
    setSkipNext(true);
    onChange(s.label);
    onSelect({
      label: s.label,
      lat: s.lat,
      lon: s.lon,
      city: s.city,
      state: s.state,
      country: s.country,
    });
    setOpen(false);
    setResults([]);
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={inputId}
        required={required}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[hi]) {
            e.preventDefault();
            pick(results[hi]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2">
              <Search className="size-3.5" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matches found.</div>
          ) : (
            <ul className="max-h-72 overflow-auto py-1">
              {results.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(r);
                    }}
                    onMouseEnter={() => setHi(i)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm flex items-start gap-2",
                      i === hi ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                    )}
                  >
                    <MapPin className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{r.label}</span>
                      {(r.city || r.state || r.country) && (
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {[r.city, r.state, r.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
