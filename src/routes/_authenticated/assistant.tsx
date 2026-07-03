import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Bot, Send, Sparkles, Trash2, User as UserIcon, Mic, MicOff,
  Volume2, VolumeX, Shield, ParkingCircle, DollarSign, Wrench, FileWarning, PackageCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAssistantHistory, clearAssistantHistory } from "@/lib/assistant.functions";
import { speak, cancelSpeech } from "@/lib/voice/voice-engine";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
});

const QUICK_ACTIONS: { icon: any; label: string; prompt: string }[] = [
  { icon: Shield, label: "Route safety", prompt: "Summarize active hazards on my typical routes and flag any high severity ones nearby." },
  { icon: ParkingCircle, label: "Truck parking", prompt: "Where should I look for truck parking tonight? What features does Navaroad's Parking page offer?" },
  { icon: DollarSign, label: "Profitability", prompt: "Give me a profitability review for the last 90 days — top and bottom trucks and drivers." },
  { icon: Wrench, label: "Maintenance due", prompt: "Which trucks have the highest maintenance spend and which are likely due for service soon?" },
  { icon: FileWarning, label: "Expiring documents", prompt: "List documents expiring in the next 60 days with dates." },
  { icon: PackageCheck, label: "Active loads", prompt: "Summarize my active loads: pickups, deliveries, revenue, and status." },
];

// Minimal SpeechRecognition typing
type SR = any;
function getSpeechRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function AssistantPage() {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SR | null>(null);
  const lastSpokenId = useRef<string | null>(null);
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

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }), [token]);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: "fleet-copilot",
    transport,
    onError: (err) => toast.error(err.message || "AI error"),
  });

  useEffect(() => {
    if (historyData?.messages && messages.length === 0) {
      setMessages(historyData.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts: [{ type: "text", text: m.content }],
      })) as UIMessage[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyData]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => { inputRef.current?.focus(); }, [status]);

  // Speak new assistant messages when streaming completes
  useEffect(() => {
    if (!voiceOut) return;
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (lastSpokenId.current === last.id) return;
    const text = last.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
    if (!text.trim()) return;
    lastSpokenId.current = last.id;
    speak(text, { priority: "normal", dedupeKey: `assistant:${last.id}` });
  }, [messages, status, voiceOut]);

  const busy = status === "submitted" || status === "streaming";

  async function submit(text: string) {
    if (!text.trim() || busy || !token) return;
    setInput("");
    cancelSpeech();
    await sendMessage({ text: text.trim() });
  }

  async function onClear() {
    await clearHistory();
    setMessages([]);
    lastSpokenId.current = null;
    queryClient.invalidateQueries({ queryKey: ["assistant-history"] });
    toast.success("History cleared");
  }

  function toggleMic() {
    if (listening) {
      recogRef.current?.stop?.();
      setListening(false);
      return;
    }
    const rec = getSpeechRecognition();
    if (!rec) {
      toast.error("Voice input not supported in this browser");
      return;
    }
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => { setListening(false); };
    rec.onend = () => {
      setListening(false);
      const t = (finalText || input).trim();
      if (t) submit(t);
    };
    recogRef.current = rec;
    try { rec.start(); setListening(true); cancelSpeech(); } catch { setListening(false); }
  }

  function toggleVoiceOut() {
    const next = !voiceOut;
    setVoiceOut(next);
    if (!next) cancelSpeech();
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
              <h1 className="text-lg font-semibold">Navaroad Copilot</h1>
              <p className="text-xs text-muted-foreground">Ask about routes, loads, HOS, profit, compliance</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={toggleVoiceOut} title={voiceOut ? "Mute voice" : "Enable voice"}>
              {voiceOut ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onClear}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <Card className="p-4 bg-muted/30">
                <div className="flex items-start gap-3">
                  <Bot className="size-5 text-primary mt-0.5" />
                  <div className="text-sm">
                    Hi — I'm your Navaroad Copilot. Ask me about your routes, hazards, loads, HOS, IFTA, fuel, expenses, maintenance, profitability, and documents. You can type or tap the mic.
                  </div>
                </div>
              </Card>
              <div className="text-xs uppercase tracking-wider text-muted-foreground px-1">Quick actions</div>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.label}
                      onClick={() => submit(a.prompt)}
                      className="text-left text-sm p-3 rounded-md border border-border hover:bg-accent transition-colors flex items-start gap-2"
                    >
                      <Icon className="size-4 mt-0.5 text-primary shrink-0" />
                      <span>{a.label}</span>
                    </button>
                  );
                })}
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
          <Button
            type="button"
            variant={listening ? "default" : "outline"}
            size="icon"
            onClick={toggleMic}
            disabled={busy}
            title={listening ? "Stop listening" : "Voice input"}
          >
            {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : "Ask your copilot…"}
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
