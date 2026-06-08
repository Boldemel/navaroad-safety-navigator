import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Sticky banner when the browser reports it's offline. */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (online) return null;
  return (
    <div className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-600 text-xs px-4 py-2 flex items-center gap-2">
      <WifiOff className="size-3.5" />
      <span>You're offline. Live alerts and routing will catch up once your connection returns.</span>
    </div>
  );
}
