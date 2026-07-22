/**
 * Dispatch communications thread for a single load.
 * Rork-portable: uses shared UI primitives + flex layouts.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteLoadMessage,
  listLoadMessages,
  postLoadMessage,
} from "@/lib/dispatch-extras.functions";

export function DispatchCommsPanel({ loadId }: { loadId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLoadMessages);
  const postFn = useServerFn(postLoadMessage);
  const delFn = useServerFn(deleteLoadMessage);
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dispatch", "comms", loadId],
    queryFn: () => listFn({ data: { loadId } }),
    refetchInterval: 30_000,
  });
  const messages = data?.messages ?? [];

  const post = useMutation({
    mutationFn: () => postFn({ data: { loadId, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["dispatch", "comms", loadId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["dispatch", "comms", loadId] }),
  });

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageSquare className="size-3.5" /> Communications
        <span className="ml-auto text-[10px]">{messages.length}</span>
      </div>
      <ul className="space-y-1.5 max-h-56 overflow-auto">
        {isLoading ? (
          <li className="text-[11px] text-muted-foreground">Loading…</li>
        ) : messages.length === 0 ? (
          <li className="text-[11px] text-muted-foreground">
            No messages yet. Add a note for your team below.
          </li>
        ) : (
          messages.map((m) => (
            <li
              key={m.id}
              className="rounded-md bg-background border px-2 py-1.5 text-sm"
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="font-medium">
                  {m.authorName ?? "Team member"}
                </span>
                <span>· {new Date(m.createdAt).toLocaleString()}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 ml-auto text-destructive"
                  onClick={() => del.mutate(m.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </li>
          ))
        )}
      </ul>
      <div className="flex items-end gap-1.5">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a dispatch note…"
          className="text-sm"
        />
        <Button
          size="sm"
          onClick={() => post.mutate()}
          disabled={!body.trim() || post.isPending}
        >
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
