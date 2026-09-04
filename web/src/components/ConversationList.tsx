import { MessageSquare, Search } from "lucide-react";
import type { Conversation, CrmUser } from "@/lib/types";
import { Avatar, Input, PanelState, Spinner } from "@/components/ui";
import { cn, relativeTime, CHANNEL_LABEL } from "@/lib/utils";

/**
 * Conversation list.
 *
 * Every value shown here comes from the `/conversations` payload itself. It
 * deliberately does NOT fetch messages per row: one request per visible
 * conversation would mean ~25 extra calls to the CRM every time the list
 * renders, which is exactly the pattern that has to stay out of this screen.
 */
export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  advisors,
  assignedTo,
  onAssignedToChange,
  canFilterByAdvisor,
  loading,
  error,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (c: Conversation) => void;
  search: string;
  onSearchChange: (v: string) => void;
  advisors: CrmUser[];
  assignedTo: string;
  onAssignedToChange: (v: string) => void;
  canFilterByAdvisor: boolean;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <h2 className="font-display text-lg font-semibold">Conversaciones</h2>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar contacto…"
            aria-label="Buscar conversaciones"
            className="pl-9"
          />
        </div>

        {/* Advisors only ever see their own conversations — the backend
            enforces that regardless, so the control is simply not offered. */}
        {canFilterByAdvisor && (
          <select
            value={assignedTo}
            onChange={(e) => onAssignedToChange(e.target.value)}
            aria-label="Filtrar por asesor"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Todos los asesores</option>
            {advisors.map((a) => (
              <option key={a.ghlUserId} value={a.ghlUserId}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        )}

        {!loading && error && (
          <PanelState
            title="No se pudieron cargar las conversaciones"
            detail={error}
          />
        )}

        {!loading && !error && conversations.length === 0 && (
          <PanelState
            icon={<MessageSquare className="h-8 w-8 text-muted-foreground" aria-hidden />}
            title="Sin conversaciones"
            detail={
              search
                ? "Ningún contacto coincide con tu búsqueda."
                : "Cuando lleguen mensajes nuevos aparecerán aquí."
            }
          />
        )}

        {!loading &&
          !error &&
          conversations.map((c) => {
            const when = relativeTime(c.lastTimestamp);
            const selected = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                aria-current={selected}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border/60 p-4 text-left",
                  "transition-colors hover:bg-accent/50",
                  selected && "bg-accent",
                )}
              >
                <Avatar initials={c.contactInitials} color={c.contactAvatarColor} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{c.contactName}</span>
                    {/* No timestamp means the CRM gave no usable date. Show
                        nothing rather than a time we would have invented. */}
                    {when && (
                      <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
                    )}
                  </div>

                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {c.lastMessage || "Sin mensajes"}
                  </p>

                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {CHANNEL_LABEL[c.channel] ?? c.channel}
                    </span>
                    {c.unread > 0 && (
                      <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
