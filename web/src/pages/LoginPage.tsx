import * as React from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Button, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // On success the provider swaps this screen out — nothing to do here.
    } catch (err) {
      // Show the backend's own message: it already distinguishes bad
      // credentials from an inactive user or a disconnected academy, and each
      // needs a different action from the person reading it.
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo iniciar sesión. Inténtalo de nuevo.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">SalesOS</h1>
            <p className="mt-1 text-sm text-muted-foreground">CRM comercial para academias de belleza</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Correo
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@academia.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <Button type="submit" loading={submitting} className="mt-1 w-full">
            {submitting ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ¿Problemas para entrar? Contacta al administrador de tu academia.
        </p>
      </div>
    </main>
  );
}
