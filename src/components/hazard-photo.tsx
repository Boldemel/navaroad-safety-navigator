import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  path: string | null | undefined;
  className?: string;
  alt?: string;
};

// Cache signed URLs in-memory so we don't re-sign on every render.
const cache = new Map<string, { url: string; expires: number }>();

export function HazardPhoto({ path, className, alt = "Hazard photo" }: Props) {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    const hit = cache.get(path);
    return hit && hit.expires > Date.now() ? hit.url : null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) return;
    const hit = cache.get(path);
    if (hit && hit.expires > Date.now()) {
      setUrl(hit.url);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from("hazard-photos")
        .createSignedUrl(path, 60 * 60);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setFailed(true);
        return;
      }
      cache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60_000 });
      setUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) return null;
  if (failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-md border border-border bg-muted text-muted-foreground", className)}>
        <ImageIcon className="size-4" />
      </div>
    );
  }
  if (!url) {
    return <div className={cn("rounded-md bg-muted animate-pulse", className)} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={cn("block overflow-hidden rounded-md border border-border", className)}>
      <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" />
    </a>
  );
}
