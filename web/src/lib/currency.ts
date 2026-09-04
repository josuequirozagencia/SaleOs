/**
 * Money formatting driven by the tenant's own currency configuration.
 *
 * Academies configure their currency, separators, decimals and symbol position
 * in Settings, so amounts must be formatted from that config rather than from
 * a hardcoded locale — S/ 1,250.00 and 1.250,00 € are both correct, for
 * different tenants.
 */

import type { CurrencyConfig } from "./types";

/** Used only until the tenant's real configuration has loaded. */
export const FALLBACK_CURRENCY: CurrencyConfig = {
  currencyCode: "PEN",
  currencySymbol: "S/",
  currencyName: "Sol peruano",
  decimalDigits: 2,
  decimalSeparator: ".",
  thousandsSeparator: ",",
  position: "before",
};

export function formatMoney(amount: number, cfg: CurrencyConfig = FALLBACK_CURRENCY): string {
  if (!Number.isFinite(amount)) return "—";

  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(cfg.decimalDigits);
  const [whole, decimals] = fixed.split(".");

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousandsSeparator);
  const body = decimals ? `${grouped}${cfg.decimalSeparator}${decimals}` : grouped;

  const withSymbol =
    cfg.position === "before" ? `${cfg.currencySymbol} ${body}` : `${body} ${cfg.currencySymbol}`;

  return negative ? `-${withSymbol}` : withSymbol;
}

/**
 * Parse what a person typed into an amount field.
 *
 * Accepts the tenant's own separators, so someone configured for "1.250,50"
 * is not forced to type it the American way. Returns null when the input is
 * not a usable number, so the caller can reject rather than store a NaN.
 */
export function parseMoney(input: string, cfg: CurrencyConfig = FALLBACK_CURRENCY): number | null {
  const cleaned = input
    .replace(new RegExp(`\\${cfg.currencySymbol}`, "g"), "")
    .split(cfg.thousandsSeparator).join("")
    .replace(cfg.decimalSeparator, ".")
    .trim();

  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
