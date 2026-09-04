import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Conversation } from "@/lib/types";
import { useAuth } from "@/auth/AuthContext";
import { ConversationList } from "@/components/ConversationList";
import { MessageThread } from "@/components/MessageThread";
import { PanelState } from "@/components/ui";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
/** Debounce for the search box, so typing does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function ConversationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selected, setSelected] = React.useState<Conversation | null>(null);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [assignedTo, setAssignedTo] = React.useState("all");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // Only roles with a wider scope get the advisor filter; an advisor is pinned
  // to their own data by the backend anyway.
  const canFilterByAdvisor = user?.role === "admin" || user?.role === "super_admin" || user?.role === "supervisor";

  const advisorsQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => api.users.list(),
    enabled: canFilterByAdvisor,
    staleTime: 5 * 60 * 1000,
  });

  const conversationsQuery = useQuery({
    queryKey: ["conversations", debouncedSearch, assignedTo],
    queryFn: () =>
      api.conversations.list({
        page: 1,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        assignedTo: canFilterByAdvisor ? assignedTo : undefined,
      }),
    staleTime: 15 * 1000,
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", selected?.id],
    queryFn: () => api.conversations.messages(selected!.id, { page: 1, pageSize: 50 }),
    enabled: !!selected,
    staleTime: 10 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: ({ text, visibility }: { text: string; visibility: "external" | "internal" }) =>
      api.conversations.send(selected!.id, text, visibility),
    onSuccess: () => {
      // Refetch the thread and the list — the list shows the new last message.
      queryClient.invalidateQueries({ queryKey: ["messages", selected?.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  // Marking read is best-effort: it must never block or break the thread view.
  React.useEffect(() => {
    if (!selected || selected.unread === 0) return;
    api.conversations
      .markRead(selected.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["conversations"] }))
      .catch(() => { /* a failed read receipt is not worth interrupting the user */ });
  }, [selected, queryClient]);

  const conversations = conversationsQuery.data?.data ?? [];

  return (
    <div className="flex h-full min-h-0">
      {/* On mobile only one panel is visible at a time; from md up, both. */}
      <aside
        className={cn(
          "w-full shrink-0 border-r border-border md:w-80 lg:w-96",
          selected ? "hidden md:block" : "block",
        )}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          search={search}
          onSearchChange={setSearch}
          advisors={advisorsQuery.data ?? []}
          assignedTo={assignedTo}
          onAssignedToChange={setAssignedTo}
          canFilterByAdvisor={canFilterByAdvisor}
          loading={conversationsQuery.isLoading}
          error={
            conversationsQuery.isError
              ? message(conversationsQuery.error, "Error al cargar.")
              : null
          }
        />
      </aside>

      <section className={cn("min-w-0 flex-1", selected ? "block" : "hidden md:block")}>
        {selected ? (
          <MessageThread
            conversation={selected}
            messages={messagesQuery.data?.data ?? []}
            loading={messagesQuery.isLoading}
            error={messagesQuery.isError ? message(messagesQuery.error, "Error al cargar.") : null}
            onSend={async (text, visibility) => {
              await sendMutation.mutateAsync({ text, visibility });
            }}
            sending={sendMutation.isPending}
            sendError={
              sendMutation.isError
                ? message(sendMutation.error, "No se pudo enviar el mensaje.")
                : null
            }
            onBack={() => setSelected(null)}
          />
        ) : (
          <PanelState
            icon={<MessageSquare className="h-10 w-10 text-muted-foreground" aria-hidden />}
            title="Selecciona una conversación"
            detail="Elige un contacto de la lista para ver el historial y responder."
          />
        )}
      </section>
    </div>
  );
}
