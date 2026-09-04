import * as React from "react";
import { ArrowLeft, Bot, Send, StickyNote } from "lucide-react";
import type { Conversation, CrmMessage } from "@/lib/types";
import { Avatar, Button, PanelState, Spinner } from "@/components/ui";
import { cn, clockTime, dayLabel, CHANNEL_LABEL } from "@/lib/utils";

/** Group messages under day separators, keeping undated ones together. */
function groupByDay(messages: CrmMessage[]): { label: string | null; items: CrmMessage[] }[] {
  const groups: { label: string | null; items: CrmMessage[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }
  return groups;
}

export function MessageThread({
  conversation,
  messages,
  loading,
  error,
  onSend,
  sending,
  sendError,
  onBack,
}: {
  conversation: Conversation;
  messages: CrmMessage[];
  loading: boolean;
  error: string | null;
  onSend: (text: string, visibility: "external" | "internal") => Promise<void>;
  sending: boolean;
  sendError: string | null;
  onBack: () => void;
}) {
  const [text, setText] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the thread grows.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, conversation.id]);

  // Switching conversation must not carry a half-typed message across.
  React.useEffect(() => {
    setText("");
    setInternal(false);
  }, [conversation.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    await onSend(body, internal ? "internal" : "external");
    setText("");
  }

  const groups = groupByDay(messages);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="md:hidden"
          aria-label="Volver a la lista"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Button>

        <Avatar initials={conversation.contactInitials} color={conversation.contactAvatarColor} />

        <div className="min-w-0">
          <p className="truncate font-display font-semibold">{conversation.contactName}</p>
          <p className="text-xs text-muted-foreground">
            {CHANNEL_LABEL[conversation.channel] ?? conversation.channel}
          </p>
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        )}

        {!loading && error && (
          <PanelState title="No se pudieron cargar los mensajes" detail={error} />
        )}

        {!loading && !error && messages.length === 0 && (
          <PanelState title="Sin mensajes todavía" detail="Escribe el primer mensaje abajo." />
        )}

        {!loading &&
          !error &&
          groups.map((g, gi) => (
            <div key={gi} className="mb-4 flex flex-col gap-2">
              {g.label && (
                <div className="my-2 flex justify-center">
                  <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-secondary-foreground">
                    {g.label}
                  </span>
                </div>
              )}

              {g.items.map((m) => {
                const outbound = m.direction === "outbound";
                const isNote = m.visibility === "internal";
                const at = clockTime(m.timestamp);
                return (
                  <div
                    key={m.id}
                    className={cn("flex w-full", outbound ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm sm:max-w-[70%]",
                        isNote
                          ? "border border-amber-500/40 bg-amber-500/10 text-foreground"
                          : outbound
                            ? "bg-bubble-out text-bubble-out-foreground"
                            : "bg-bubble-in text-bubble-in-foreground",
                      )}
                    >
                      {isNote && (
                        <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-500">
                          <StickyNote className="h-3 w-3" aria-hidden />
                          Nota interna
                        </span>
                      )}

                      {m.isAi && !isNote && (
                        <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium opacity-80">
                          <Bot className="h-3 w-3" aria-hidden />
                          IA
                        </span>
                      )}

                      <p className="whitespace-pre-wrap break-words">{m.text}</p>

                      {/* Undated messages show no clock rather than a made-up one. */}
                      {at && (
                        <span
                          className={cn(
                            "mt-1 block text-right text-[10px]",
                            outbound && !isNote ? "opacity-70" : "text-muted-foreground",
                          )}
                        >
                          {at}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 border-t border-border p-4">
        {sendError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {sendError}
          </p>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(e as unknown as React.FormEvent);
              }
            }}
            rows={2}
            placeholder={internal ? "Escribe una nota interna…" : "Escribe un mensaje…"}
            aria-label={internal ? "Nota interna" : "Mensaje"}
            className="scrollbar-thin min-h-[44px] flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" loading={sending} aria-label="Enviar">
            {!sending && <Send className="h-4 w-4" aria-hidden />}
          </Button>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          Nota interna (no se envía al contacto)
        </label>
      </form>
    </div>
  );
}
