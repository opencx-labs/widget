import type { Money } from "../../shared/types.ts";

export function formatMoney(m: Money | undefined | null, opts?: { sign?: boolean }): string {
  if (!m) return "—";
  const n = Number(m.value);
  const formatted = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: m.currency || "EUR",
  }).format(Math.abs(n));
  if (opts?.sign && n !== 0) return `${n < 0 ? "−" : "+"}${formatted}`;
  return n < 0 ? `−${formatted}` : formatted;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IE").format(n);
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATE_FMT.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${DATE_FMT.format(d)}, ${TIME_FMT.format(d)}`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

const TITLE_CASE: Record<string, string> = {
  ideal: "iDEAL",
  creditcard: "Card",
  paypal: "PayPal",
  banktransfer: "Bank transfer",
  bancontact: "Bancontact",
  applepay: "Apple Pay",
  klarna: "Klarna",
  sofort: "SOFORT",
  giftcard: "Gift card",
};

export function methodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return TITLE_CASE[method] ?? method;
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());
}
