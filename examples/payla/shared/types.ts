// Shared domain types + Zod schemas for Payla.
// Used by the Worker API (worker/*) and the React app (src/*).
// Amounts follow Mollie's convention: an { value, currency } object where value is a
// decimal string. Internally the DB stores integer minor units (cents).

import { z } from "zod";

export const CURRENCY = "EUR" as const;

export const PAYMENT_STATUSES = [
  "open",
  "pending",
  "authorized",
  "paid",
  "failed",
  "canceled",
  "expired",
  "refunded",
  "partially_refunded",
  "charged_back",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "ideal",
  "creditcard",
  "paypal",
  "banktransfer",
  "bancontact",
  "applepay",
  "klarna",
  "sofort",
  "giftcard",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REFUND_STATUSES = ["queued", "pending", "processing", "refunded", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const PAYMENT_LINK_STATUSES = ["active", "paid", "expired"] as const;
export type PaymentLinkStatus = (typeof PAYMENT_LINK_STATUSES)[number];

export const SETTLEMENT_STATUSES = ["open", "pending", "paidout", "failed"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const DISPUTE_STATUSES = ["open", "under_review", "won", "lost", "expired"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_REASONS = [
  "fraudulent",
  "product_not_received",
  "duplicate",
  "subscription_canceled",
  "general",
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const Money = z.object({
  value: z.string(), // decimal string, e.g. "35.50"
  currency: z.string(), // ISO 4217, e.g. "EUR"
});
export type Money = z.infer<typeof Money>;

export const Customer = z.object({
  id: z.string(), // cst_...
  name: z.string(),
  email: z.string(),
  locale: z.string(),
  createdAt: z.string(),
  paymentsCount: z.number(),
  totalSpent: Money,
});
export type Customer = z.infer<typeof Customer>;

export const Refund = z.object({
  id: z.string(), // re_...
  paymentId: z.string(),
  amount: Money,
  status: z.enum(REFUND_STATUSES),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type Refund = z.infer<typeof Refund>;

export const Payment = z.object({
  id: z.string(), // tr_...
  status: z.enum(PAYMENT_STATUSES),
  amount: Money,
  amountRefunded: Money,
  method: z.enum(PAYMENT_METHODS).nullable(),
  description: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  settlementId: z.string().nullable(),
});
export type Payment = z.infer<typeof Payment>;

export const PaymentLink = z.object({
  id: z.string(), // pl_...
  description: z.string(),
  amount: Money,
  status: z.enum(PAYMENT_LINK_STATUSES),
  url: z.string(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
});
export type PaymentLink = z.infer<typeof PaymentLink>;

export const Settlement = z.object({
  id: z.string(), // stl_...
  reference: z.string(),
  amount: Money,
  status: z.enum(SETTLEMENT_STATUSES),
  createdAt: z.string(),
  settledAt: z.string().nullable(),
  paymentsCount: z.number(),
});
export type Settlement = z.infer<typeof Settlement>;

export const Dispute = z.object({
  id: z.string(), // chb_...
  paymentId: z.string(),
  amount: Money,
  reason: z.enum(DISPUTE_REASONS),
  status: z.enum(DISPUTE_STATUSES),
  createdAt: z.string(),
  dueAt: z.string().nullable(),
});
export type Dispute = z.infer<typeof Dispute>;

export const Balance = z.object({
  available: Money,
  pending: Money,
  currency: z.string(),
});
export type Balance = z.infer<typeof Balance>;

export const Settings = z.object({
  merchantName: z.string(),
  merchantId: z.string(),
  email: z.string(),
  country: z.string(),
  payoutSchedule: z.enum(["daily", "weekly", "monthly"]),
  statementDescriptor: z.string(),
  testMode: z.boolean(),
});
export type Settings = z.infer<typeof Settings>;

export const MetricsPoint = z.object({ date: z.string(), amount: z.number() });
export type MetricsPoint = z.infer<typeof MetricsPoint>;

export const Metrics = z.object({
  revenue30d: Money,
  revenuePrev30d: Money,
  paymentsCount30d: z.number(),
  successRate: z.number(), // 0..1
  avgOrderValue: Money,
  openDisputes: z.number(),
  series: z.array(MetricsPoint), // daily revenue for the trailing window
  methodBreakdown: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amount: Money, count: z.number() })),
});
export type Metrics = z.infer<typeof Metrics>;

// ---- Action request bodies ----

export const CreatePaymentLinkInput = z.object({
  amount: z.number().positive(), // major units, e.g. 49.99
  description: z.string().min(1).max(200),
});
export type CreatePaymentLinkInput = z.infer<typeof CreatePaymentLinkInput>;

export const RefundPaymentInput = z.object({
  amount: z.number().positive().optional(), // major units; omit for a full refund
  reason: z.string().max(200).optional(),
});
export type RefundPaymentInput = z.infer<typeof RefundPaymentInput>;

export const CreatePaymentInput = z.object({
  amount: z.number().positive(),
  description: z.string().min(1).max(200),
  method: z.enum(PAYMENT_METHODS).optional(),
  customerId: z.string().optional(),
});
export type CreatePaymentInput = z.infer<typeof CreatePaymentInput>;

export interface ListMeta {
  count: number;
  total: number;
}
export interface Paginated<T> {
  data: T[];
  meta: ListMeta;
}
