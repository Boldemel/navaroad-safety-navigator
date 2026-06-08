import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Bot, Send, Sparkles, Trash2, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAssistantHistory, clearAssistantHistory } from "@/lib/assistant.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
});

const SUGGESTIONS = [
  "Which truck lost the most money in the last 90 days?",
  "Why is Truck 23 unprofitable? Break down fuel, repairs, and pay.",
  "Who are my top 3 drivers by revenue and which had the lowest cost-per-mile?",
  "Which expense category is eating into margin the most?",
  "Show fuel cost per gallon by state and flag outliers.",
];

function AssistantPage() {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const loadHistory = useServerFn(listAssistantHistory);
  const clearHistory = useServerFn(clearAssistantHistory);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const { data: historyData } = useQuery({
    queryKey: ["assistant-history"],
    queryFn: () => loadHistory(),
  });

  const initialMessages: UIMessage[] = (historyData?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: [{ type: "text", text: m.content }],
  }));

  const transport = new DefaultChatTransport({
    api: "/api/chat",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const { messages, sendMessage, status, setMessages } = useChat({
    id: "fleet-assistant",
    messages: initialMessages,
    transport,
    onError: (err) => toast.error(err.message || "AI error"),
  });

  // Seed messages from history once loaded
  useEffect(() => {
    if (historyData?.messages && messages.length === 0) {
      setMessages(initialMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyData]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => { inputRef.current?.focus(); }, [status]);

  const busy = status === "submitted" || status === "streaming";

  async function submit(text: string) {
    if (!text.trim() || busy || !token) return;
    setInput("");
    await sendMessage({ text: text.trim() });
  }

  async function onClear() {
    await clearHistory();
    setMessages([]);
    queryClient.invalidateQueries({ queryKey: ["assistant-history"] });
    toast.success("History cleared");
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto p-4 md:p-6 flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Fleet AI Assistant</h1>
              <p className="text-xs text-muted-foreground">Ask about profitability, drivers, trucks, costs</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <Trash2 className="size-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <Card className="p-4 bg-muted/30">
                <div className="flex items-start gap-3">
                  <Bot className="size-5 text-primary mt-0.5" />
                  <div className="text-sm">
                    Hi — I'm your fleet AI. I analyze your last 90 days of loads, fuel, maintenance, expenses, and settlements to answer questions about profitability and performance.
                  </div>
                </div>
              </Card>
              <div className="text-xs uppercase tracking-wider text-muted-foreground px-1">Try asking</div>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-left text-sm p-3 rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const text = m.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
                {!isUser && (
                  <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Bot className="size-4" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {text}
                </div>
                {isUser && (
                  <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <UserIcon className="size-4" />
                  </div>
                )}
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex gap-3">
              <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Bot className="size-4" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">Thinking…</div>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          className="pt-3 border-t border-border flex gap-2"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your fleet…"
            disabled={busy || !token}
            autoFocus
          />
          <Button type="submit" disabled={busy || !input.trim() || !token}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
