import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useReminders, type Reminder } from "@/hooks/use-reminders";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function severityClass(s: Reminder["severity"]) {
  if (s === "overdue") return "bg-destructive/15 text-destructive border-destructive/30";
  if (s === "soon") return "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400";
  return "bg-muted text-muted-foreground border-border";
}

export function NotificationBell() {
  const { data: reminders = [] } = useReminders();
  const urgent = reminders.filter((r) => r.severity !== "upcoming").length;
  const count = reminders.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative inline-flex items-center justify-center size-9 rounded-md hover:bg-accent text-foreground/80"
        >
          <Bell className="size-5" />
          {count > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center",
                urgent > 0 ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm">Reminders</div>
          <div className="text-xs text-muted-foreground">{count} active</div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {reminders.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {reminders.map((r) => (
                <li key={r.id}>
                  <Link
                    to={r.to}
                    className="block px-3 py-2.5 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.detail}</div>
                      </div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap", severityClass(r.severity))}>
                        {r.severity}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
