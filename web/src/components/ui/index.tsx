/**
 * Small set of UI primitives, in the shape the current app already uses
 * (shadcn-style variants on top of the theme tokens). Deliberately hand-rolled
 * and minimal: only what the Login and Conversations screens need, so the
 * dependency surface stays small until more screens actually require more.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Button ──────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "icon";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  icon: "h-10 w-10",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium",
        "transition-colors disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

// ── Input ───────────────────────────────────────────────────────────────

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

// ── Avatar ──────────────────────────────────────────────────────────────

export function Avatar({
  initials,
  color,
  className,
}: {
  initials: string;
  color?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={color ? { backgroundColor: color } : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        "h-10 w-10 text-sm font-semibold text-white",
        !color && "bg-primary",
        className,
      )}
    >
      {initials}
    </span>
  );
}

// ── Feedback ────────────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} aria-hidden />;
}

/** Centred state for a panel that is loading, empty, or failed. */
export function PanelState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {icon}
      <p className="font-display text-base font-semibold">{title}</p>
      {detail && <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>}
      {action}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
