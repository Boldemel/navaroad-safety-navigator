/**
 * AI Dispatch Assistant panel.
 *
 * A dispatcher-focused thin wrapper over the shared `/api/chat`
 * endpoint. It sends the current Dispatch snapshot summary as the first
 * user turn's system-style context so the model answers questions like
 * "Find the best load for Truck 105", "Which driver has enough HOS to
 * deliver tomorrow?", and "Show the most profitable available loads"
 * using live company data.
 *
 * All AI features flow through ONE shared AI engine (see architecture
 * memory) — this component does not spin up its own model call.
 */
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Loader2, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DispatchSnapshot } from "@/lib/dispatch.functions";

const SUGGESTIONS = [
  "Find the best load for Truck 105.",
  "Which driver has enough HOS to deliver tomorrow?",
  "Show the most profitable available loads.",
  "Assign the closest driver to the next unassigned load.",
];

function buildContextPrompt(snapshot: DispatchSnapshot): string {
  const { overview, loads, drivers, trucks } = snapshot;
  const openLoads = loads
    .filter((l) => l.dispatchStatus === "unassigned")
    .slice(0, 10)
    .map(
      (l) =>
        `- ${l.bolNumber ?? l.id.slice(0, 6)} · ${l.shipperName ?? "?"} → ${l.consigneeName ?? "?"} · ${l.totalMiles ?? "?"} mi · $${l.rateUsd ?? "?"} · pickup ${l.pickupAt ?? "?"} · deliver ${l.deliveryAt ?? "?"}`,
    )
    .join("\n");
  const availableDrivers = drivers
    .filter((d) => d.status === "available")
    .slice(0, 15)
    .map((d) => `- ${d.name}${d.assignedTruck ? ` (Truck ${d.assignedTruck})` : ""}`)
    .join("\n");
  const availableTrucks = trucks
    .filter((t) => t.status === "available")
    .slice(0, 15)
    .map((t) => `- Truck ${t.vehicleUnit}`)
    .join("\n");
  return [
    "[Dispatch context — live snapshot]",
    `Active loads: ${overview.activeLoads}, Unassigned: ${overview.unassignedLoads}, Available drivers: ${overview.availableDrivers}, Available trucks: ${overview.availableTrucks}, Deliveries due today: ${overview.deliveriesDueToday}.`,
    "",
    "Unassigned loads:",
    openLoads || "(none)",
    "",
    "Available drivers:",
    availableDrivers || "(none)",
    "",
    "Available trucks:",
    availableTrucks || "(none)",
    "",
    "Answer as a fleet dispatcher assistant. Recommend concrete assignments and cite the load BOL / driver name / truck unit.",
  ].join("\n");
}

export function AiDispatchPanel({ snapshot }: { snapshot: DispatchSnapshot }) {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat({
    id: "dispatch-assistant",
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const busy = status === "submitted" || status === "streaming";

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const contextTurn = messages.length === 0 ? `${buildContextPrompt(snapshot)}\n\nDispatcher question: ${trimmed}` : trimmed;
    await sendMessage({ text: contextTurn });
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-[520px]">
      <div className="px-4 py-3 border-b bg-primary/5 flex items-center gap-2">
        <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center">
          <Sparkles className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">AI Dispatch Assistant</div>
          <div className="text-[11px] text-muted-foreground">
            Ask about loads, drivers, HOS, or profitability.
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground mb-2">Try one of these:</div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="w-full text-left text-sm rounded-md border border-border bg-background px-3 py-2 hover:bg-accent transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m: UIMessage) => {
              const text = m.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
              const clean = text.startsWith("[Dispatch context")
                ? text.split("Dispatcher question:").slice(-1)[0]?.trim() ?? text
                : text;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary/10 border border-primary/20 ml-6"
                      : "bg-muted/50 border border-border mr-6",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
                    {m.role === "user" ? "You" : "Assistant"}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{clean}</ReactMarkdown>
                  </div>
                </div>
              );
            })}
            {busy ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Thinking…
              </div>
            ) : null}
          </div>
        )}
      </ScrollArea>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t p-2 flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the dispatch assistant…"
          disabled={busy}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
