// Maps domain statuses to a visual tone for StatusPill.
export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const PAYMENT: Record<string, Tone> = {
  paid: "success",
  open: "neutral",
  pending: "warning",
  authorized: "info",
  failed: "danger",
  canceled: "neutral",
  expired: "neutral",
  refunded: "neutral",
  partially_refunded: "info",
  charged_back: "danger",
};

const REFUND: Record<string, Tone> = {
  refunded: "success",
  queued: "warning",
  pending: "warning",
  processing: "warning",
  failed: "danger",
};

const PAYMENT_LINK: Record<string, Tone> = {
  active: "info",
  paid: "success",
  expired: "neutral",
};

const SETTLEMENT: Record<string, Tone> = {
  paidout: "success",
  pending: "warning",
  open: "neutral",
  failed: "danger",
};

const DISPUTE: Record<string, Tone> = {
  won: "success",
  lost: "danger",
  open: "warning",
  under_review: "warning",
  expired: "neutral",
};

export const paymentTone = (s: string): Tone => PAYMENT[s] ?? "neutral";
export const refundTone = (s: string): Tone => REFUND[s] ?? "neutral";
export const paymentLinkTone = (s: string): Tone => PAYMENT_LINK[s] ?? "neutral";
export const settlementTone = (s: string): Tone => SETTLEMENT[s] ?? "neutral";
export const disputeTone = (s: string): Tone => DISPUTE[s] ?? "neutral";
