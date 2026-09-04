import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type {
  Contact,
  CurrencyConfig,
  CustomField,
  MatriculaInput,
  MatriculaStatus,
  PaymentMethod,
} from "@/lib/types";
import { formatMoney, parseMoney } from "@/lib/currency";
import { Avatar, Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "yape", label: "Yape" },
  { value: "plin", label: "Plin" },
  { value: "otro", label: "Otro" },
];

const STATUSES: { value: MatriculaStatus; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "abonado", label: "Abonado" },
  { value: "matriculado", label: "Matriculado" },
];

/** ISO date (yyyy-mm-dd) for a date input, in local time. */
function toDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Errors = Partial<Record<string, string>>;

export function MatriculaForm({
  currency,
  onSubmit,
  submitting,
  submitError,
  onCancel,
}: {
  currency: CurrencyConfig;
  onSubmit: (data: MatriculaInput) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  onCancel: () => void;
}) {
  const [contact, setContact] = React.useState<Contact | null>(null);
  const [contactSearch, setContactSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  const [areaId, setAreaId] = React.useState("");
  const [programId, setProgramId] = React.useState("");
  const [total, setTotal] = React.useState("");
  const [abono, setAbono] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("efectivo");
  const [date, setDate] = React.useState(() => toDateInput(Date.now()));
  const [status, setStatus] = React.useState<MatriculaStatus>("pendiente");
  const [notes, setNotes] = React.useState("");
  const [custom, setCustom] = React.useState<Record<string, string | string[] | boolean | number>>({});
  const [errors, setErrors] = React.useState<Errors>({});

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(contactSearch), 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  // Only contacts without a matrícula are offered: the backend rejects a
  // second one for the same contact, so listing them would only invite an error.
  const contactsQuery = useQuery({
    queryKey: ["contacts", "unenrolled", debouncedSearch],
    queryFn: () =>
      api.contacts.list({ search: debouncedSearch || undefined, matriculated: false, pageSize: 8 }),
    enabled: !contact && debouncedSearch.length > 1,
  });

  const areasQuery = useQuery({ queryKey: ["areas"], queryFn: () => api.config.areas() });
  const programsQuery = useQuery({
    queryKey: ["programs", areaId],
    queryFn: () => api.config.programsByArea(areaId),
    enabled: !!areaId,
  });
  const fieldsQuery = useQuery({ queryKey: ["custom-fields"], queryFn: () => api.config.customFields() });

  const activeFields = (fieldsQuery.data ?? []).filter((f) => f.active).sort((a, b) => a.order - b.order);

  const totalValue = parseMoney(total, currency);
  const abonoValue = parseMoney(abono, currency);
  const pendiente =
    totalValue !== null && abonoValue !== null ? Math.max(0, totalValue - abonoValue) : null;

  function validate(): Errors {
    const e: Errors = {};
    if (!contact) e.contact = "Selecciona un contacto.";
    if (!areaId) e.area = "Selecciona un área.";
    if (totalValue === null) e.total = "Indica el importe total.";
    else if (totalValue < 0) e.total = "El total no puede ser negativo.";
    if (abonoValue === null) e.abono = "Indica el abono (0 si aún no pagó).";
    else if (abonoValue < 0) e.abono = "El abono no puede ser negativo.";
    else if (totalValue !== null && abonoValue > totalValue)
      e.abono = "El abono no puede superar el total.";
    if (!date) e.date = "Indica la fecha de matrícula.";

    for (const f of activeFields) {
      if (!f.required) continue;
      const v = custom[f.key];
      const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) e[`cf_${f.key}`] = `${f.name} es obligatorio.`;
    }
    return e;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const area = areasQuery.data?.find((a) => a.id === areaId);

    await onSubmit({
      contactId: contact!.id,
      contactName: contact!.name,
      contactPhone: contact!.phone,
      area: area?.name ?? "",
      areaId,
      programId: programId || undefined,
      total: totalValue!,
      abono: abonoValue!,
      paymentMethod,
      // A date input has no time; anchor it at local midday so a timezone
      // shift cannot roll the enrollment onto the previous day.
      date: new Date(`${date}T12:00:00`).getTime(),
      status,
      notes: notes.trim() || undefined,
      customFields: Object.keys(custom).length ? custom : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* ── Contact ─────────────────────────────────────────────────── */}
      <Field label="Contacto" htmlFor="contacto" required error={errors.contact}>
        {contact ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-background p-2">
            <Avatar initials={contact.initials} color={contact.avatarColor} className="h-8 w-8 text-xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{contact.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{contact.phone}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setContact(null)}>
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="contacto"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              className="pl-9"
              autoComplete="off"
            />
            {debouncedSearch.length > 1 && (
              <div className="mt-1 max-h-52 overflow-y-auto rounded-md border border-border bg-card">
                {contactsQuery.isLoading && (
                  <div className="flex justify-center p-3">
                    <Spinner className="h-4 w-4" />
                  </div>
                )}
                {contactsQuery.isError && (
                  <p className="p-3 text-sm text-destructive">
                    {contactsQuery.error instanceof ApiError
                      ? contactsQuery.error.message
                      : "No se pudo buscar."}
                  </p>
                )}
                {contactsQuery.data?.data.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    Ningún contacto sin matrícula coincide.
                  </p>
                )}
                {contactsQuery.data?.data.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setContact(c);
                      setContactSearch("");
                    }}
                    className="flex w-full items-center gap-2 p-2 text-left hover:bg-accent/50"
                  >
                    <Avatar initials={c.initials} color={c.avatarColor} className="h-7 w-7 text-[11px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{c.phone}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Field>

      {/* ── Programme ───────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Área" htmlFor="area" required error={errors.area}>
          <Select
            id="area"
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value);
              setProgramId("");
            }}
          >
            <option value="">Selecciona…</option>
            {(areasQuery.data ?? []).filter((a) => a.active).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>

        <Field
          label="Programa"
          htmlFor="programa"
          hint={!areaId ? "Elige primero un área." : undefined}
        >
          <Select
            id="programa"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            disabled={!areaId || programsQuery.isLoading}
          >
            <option value="">Sin programa</option>
            {(programsQuery.data ?? []).filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* ── Money ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Total (${currency.currencyCode})`} htmlFor="total" required error={errors.total}>
          <Input
            id="total"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="0"
          />
        </Field>

        <Field label="Abono" htmlFor="abono" required error={errors.abono}>
          <Input
            id="abono"
            inputMode="decimal"
            value={abono}
            onChange={(e) => setAbono(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      {pendiente !== null && (
        <p className="-mt-1 text-sm text-muted-foreground">
          Saldo pendiente:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatMoney(pendiente, currency)}
          </span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Método de pago" htmlFor="metodo">
          <Select
            id="metodo"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Fecha" htmlFor="fecha" required error={errors.date}>
          <Input id="fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Estado" htmlFor="estado">
          <Select
            id="estado"
            value={status}
            onChange={(e) => setStatus(e.target.value as MatriculaStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* ── Custom fields, as configured by the academy ─────────────── */}
      {activeFields.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          {activeFields.map((f) => (
            <CustomFieldInput
              key={f.id}
              field={f}
              value={custom[f.key]}
              error={errors[`cf_${f.key}`]}
              onChange={(v) => setCustom((prev) => ({ ...prev, [f.key]: v }))}
            />
          ))}
        </div>
      )}

      <Field label="Notas" htmlFor="notas">
        <Textarea
          id="notas"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones internas…"
        />
      </Field>

      {submitError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting ? "Registrando…" : "Registrar matrícula"}
        </Button>
      </div>
    </form>
  );
}

/** Render one academy-configured field according to its declared type. */
function CustomFieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: CustomField;
  value: string | string[] | boolean | number | undefined;
  error?: string;
  onChange: (v: string | string[] | boolean | number) => void;
}) {
  const id = `cf_${field.key}`;
  const options = field.options ?? [];

  if (field.type === "CHECKBOX") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-[hsl(var(--primary))]"
        />
        {field.name}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </label>
    );
  }

  return (
    <Field label={field.name} htmlFor={id} required={field.required} hint={field.description} error={error}>
      {field.type === "TEXTAREA" ? (
        <Textarea
          id={id}
          rows={2}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "SELECT" || field.type === "RADIO" ? (
        <Select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona…</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      ) : field.type === "MULTISELECT" ? (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const list = Array.isArray(value) ? value : [];
            const on = list.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChange(on ? list.filter((x) => x !== o) : [...list, o])}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent/50",
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <Input
          id={id}
          type={
            field.type === "NUMBER" ? "number"
              : field.type === "EMAIL" ? "email"
              : field.type === "PHONE" ? "tel"
              : field.type === "DATE" ? "date"
              : "text"
          }
          value={String(value ?? "")}
          placeholder={field.placeholder}
          onChange={(e) =>
            onChange(field.type === "NUMBER" ? Number(e.target.value) : e.target.value)
          }
        />
      )}
    </Field>
  );
}
