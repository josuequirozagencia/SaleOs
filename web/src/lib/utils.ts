import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting later Tailwind classes win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format an epoch as a short, human relative time.
 *
 * Returns null when the instant is unknown. The backend deliberately sends
 * null rather than inventing a timestamp, so the UI shows nothing rather than
 * a confident lie about when something happened.
 */
export function relativeTime(epochMs: number | null | undefined): string | null {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return null;
  const diff = Date.now() - epochMs;
  if (diff < 0) return "ahora";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(epochMs).toLocaleDateString("es", { day: "2-digit", month: "short" });
}

/** Clock time (HH:MM) for a message bubble, or null when unknown. */
export function clockTime(epochMs: number | null | undefined): string | null {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return null;
  return new Date(epochMs).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

/** Day separator label for a message group, or null when unknown. */
export function dayLabel(epochMs: number | null | undefined): string | null {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return null;
  const d = new Date(epochMs);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (isSameDay(d, today)) return "Hoy";
  const yesterday = new Date(today.getTime() - 86400000);
  if (isSameDay(d, yesterday)) return "Ayer";
  return d.toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" });
}

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  other: "Otro",
};
