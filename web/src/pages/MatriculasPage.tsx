import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus, Search } from "lucide-react";
import { api, ApiError, MATRICULA_DUPLICATE_CODE } from "@/lib/api";
import type { Matricula, MatriculaInput, MatriculaStatus } from "@/lib/types";
import { FALLBACK_CURRENCY, formatMoney } from "@/lib/currency";
import { MatriculaForm } from "@/components/MatriculaForm";
import { Badge, Button, Input, Modal, PanelState, Select, Spinner, StatTile } from "@/components/ui";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<MatriculaStatus, string> = {
  pendiente: "Pendiente",
  abonado: "Abonado",
  matriculado: "Matriculado",
  anulado: "Anulada",
};

const STATUS_TONE: Record<MatriculaStatus, string> = {
  pendiente: "bg-amber-500/15 text-amber-500",
  abonado: "bg-sky-500/15 text-sky-400",
  matriculado: "bg-emerald-500/15 text-emerald-500",
  anulado: "bg-muted text-muted-foreground",
};

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatDate(epochMs: number | null | undefined): string {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return "—";
  return new Date(epochMs).toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MatriculasPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | MatriculaStatus>("all");
  const [formOpen, setFormOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState<Matricula | null>(null);

  const currencyQuery = useQuery({
    queryKey: ["currency"],
    queryFn: () => api.config.currency(),
    staleTime: 10 * 60 * 1000,
  });
  const currency = currencyQuery.data ?? FALLBACK_CURRENCY;

  const matriculasQuery = useQuery({
    queryKey: ["matriculas"],
    queryFn: () => api.matriculas.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: MatriculaInput) => api.matriculas.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matriculas"] });
      // A new matrícula flags the contact as enrolled, so the picker's
      // "not yet enrolled" list is now stale.
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setFormOpen(false);
      createMutation.reset();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.matriculas.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matriculas"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setConfirming(null);
    },
  });

  const all = matriculasQuery.data ?? [];

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((m) => (statusFilter === "all" ? true : m.status === statusFilter))
      .filter((m) =>
        term
          ? m.contactName.toLowerCase().includes(term) ||
            m.area.toLowerCase().includes(term) ||
            m.contactPhone.includes(term)
          : true,
      )
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  }, [all, search, statusFilter]);

  // Totals describe what is on screen, so they stay consistent with the
  // filters the user applied. Cancelled ones never count as revenue.
  const totals = React.useMemo(() => {
    const active = visible.filter((m) => m.status !== "anulado");
    return {
      count: active.length,
      facturado: active.reduce((s, m) => s + (m.total ?? 0), 0),
      cobrado: active.reduce((s, m) => s + (m.abono ?? 0), 0),
      pendiente: active.reduce((s, m) => s + (m.pendiente ?? 0), 0),
    };
  }, [visible]);

  const duplicate =
    createMutation.error instanceof ApiError &&
    (createMutation.error.code === MATRICULA_DUPLICATE_CODE ||
      createMutation.error.code === "MATRICULA_EXISTENTE");

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Matrículas</h1>
            <p className="text-sm text-muted-foreground">
              Registro comercial de alumnas matriculadas.
            </p>
          </div>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nueva matrícula
          </Button>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Matrículas" value={String(totals.count)} />
          <StatTile label="Facturado" value={formatMoney(totals.facturado, currency)} />
          <StatTile label="Cobrado" value={formatMoney(totals.cobrado, currency)} tone="positive" />
          <StatTile label="Pendiente" value={formatMoney(totals.pendiente, currency)} tone="warning" />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por alumna, área o teléfono…"
              aria-label="Buscar matrículas"
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | MatriculaStatus)}
            aria-label="Filtrar por estado"
            className="w-44"
          >
            <option value="all">Todos los estados</option>
            {(Object.keys(STATUS_LABEL) as MatriculaStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </div>

        <div className="rounded-lg border border-border bg-card">
          {matriculasQuery.isLoading && (
            <div className="flex justify-center p-10">
              <Spinner />
            </div>
          )}

          {matriculasQuery.isError && (
            <PanelState
              title="No se pudieron cargar las matrículas"
              detail={errorText(matriculasQuery.error, "Inténtalo de nuevo.")}
              action={
                <Button variant="secondary" size="sm" onClick={() => matriculasQuery.refetch()}>
                  Reintentar
                </Button>
              }
            />
          )}

          {!matriculasQuery.isLoading && !matriculasQuery.isError && visible.length === 0 && (
            <PanelState
              icon={<GraduationCap className="h-8 w-8 text-muted-foreground" aria-hidden />}
              title={all.length === 0 ? "Aún no hay matrículas" : "Ningún resultado"}
              detail={
                all.length === 0
                  ? "Registra la primera matrícula con el botón de arriba."
                  : "Prueba con otro término o cambia el filtro de estado."
              }
            />
          )}

          {visible.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3 font-medium">Alumna</th>
                    <th className="p-3 font-medium">Área</th>
                    <th className="p-3 text-right font-medium">Total</th>
                    <th className="p-3 text-right font-medium">Abono</th>
                    <th className="p-3 text-right font-medium">Pendiente</th>
                    <th className="p-3 font-medium">Fecha</th>
                    <th className="p-3 font-medium">Estado</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="p-3">
                        <span className="block font-medium">{m.contactName}</span>
                        <span className="block text-xs text-muted-foreground">{m.contactPhone}</span>
                      </td>
                      <td className="p-3 text-muted-foreground">{m.area || "—"}</td>
                      <td className="p-3 text-right tabular-nums">{formatMoney(m.total, currency)}</td>
                      <td className="p-3 text-right tabular-nums">{formatMoney(m.abono, currency)}</td>
                      <td
                        className={cn(
                          "p-3 text-right tabular-nums",
                          m.pendiente > 0 && m.status !== "anulado" && "text-amber-500",
                        )}
                      >
                        {formatMoney(m.pendiente, currency)}
                      </td>
                      <td className="p-3 text-muted-foreground">{formatDate(m.date)}</td>
                      <td className="p-3">
                        <Badge className={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        {m.status !== "anulado" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirming(m)}
                            className="text-destructive hover:text-destructive"
                          >
                            Anular
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          createMutation.reset();
        }}
        title="Nueva matrícula"
        wide
      >
        <MatriculaForm
          currency={currency}
          submitting={createMutation.isPending}
          submitError={
            createMutation.isError
              ? duplicate
                ? "Este contacto ya tiene una matrícula registrada."
                : errorText(createMutation.error, "No se pudo registrar la matrícula.")
              : null
          }
          onSubmit={async (data) => {
            await createMutation.mutateAsync(data);
          }}
          onCancel={() => {
            setFormOpen(false);
            createMutation.reset();
          }}
        />
      </Modal>

      <Modal open={!!confirming} onClose={() => setConfirming(null)} title="Anular matrícula">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Se anulará la matrícula de{" "}
            <span className="font-medium text-foreground">{confirming?.contactName}</span> por{" "}
            <span className="font-medium tabular-nums text-foreground">
              {confirming ? formatMoney(confirming.total, currency) : ""}
            </span>
            . Dejará de contar como venta y se quitará la etiqueta «Matriculado» del contacto en el CRM.
          </p>

          {cancelMutation.isError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorText(cancelMutation.error, "No se pudo anular.")}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={cancelMutation.isPending}>
              Volver
            </Button>
            <Button
              variant="destructive"
              loading={cancelMutation.isPending}
              onClick={() => confirming && cancelMutation.mutate(confirming.id)}
            >
              Anular matrícula
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
