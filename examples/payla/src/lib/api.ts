// Typed client for the Payla Worker API (same origin, /api/*).
// Every response is validated with the shared Zod schemas — no boundary casts, and a
// drifted server shape fails loudly at the fetch site instead of rendering garbage.
import { z } from "zod";
import {
  Balance,
  Customer,
  Dispute,
  Metrics,
  Payment,
  PaymentLink,
  Refund,
  Settings,
  Settlement,
} from "../../shared/types.ts";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const errorBody = z.object({
  error: z.object({ message: z.string() }).partial().optional(),
});

const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item), meta: z.object({ count: z.number(), total: z.number() }) });

const PaymentWithRefunds = Payment.extend({ refunds: z.array(Refund) });
const CustomerWithPayments = Customer.extend({ payments: z.array(Payment) });
const RefundResult = z.object({ refund: Refund, payment: Payment });

export type PaymentWithRefunds = z.infer<typeof PaymentWithRefunds>;
export type CustomerWithPayments = z.infer<typeof CustomerWithPayments>;

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const parsed = errorBody.safeParse(json);
    const message = parsed.success ? (parsed.data.error?.message ?? "") : "";
    throw new ApiError(res.status, message || `Request failed (${res.status})`);
  }
  return schema.parse(json);
}

const qs = (params: Record<string, string | number | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
};

export const api = {
  metrics: () => request("/metrics", Metrics),
  balance: () => request("/balance", Balance),
  settings: () => request("/settings", Settings),

  payments: (filters: { status?: string; method?: string; customer?: string; limit?: number } = {}) =>
    request(`/payments${qs(filters)}`, paginated(Payment)),
  payment: (id: string) => request(`/payments/${id}`, PaymentWithRefunds),
  refundPayment: (id: string, body: { amount?: number; reason?: string }) =>
    request(`/payments/${id}/refunds`, RefundResult, { method: "POST", body: JSON.stringify(body) }),

  refunds: (limit?: number) => request(`/refunds${qs({ limit })}`, paginated(Refund)),

  customers: (limit?: number) => request(`/customers${qs({ limit })}`, paginated(Customer)),
  customer: (id: string) => request(`/customers/${id}`, CustomerWithPayments),

  paymentLinks: (limit?: number) => request(`/payment-links${qs({ limit })}`, paginated(PaymentLink)),
  createPaymentLink: (body: { amount: number; description: string }) =>
    request("/payment-links", PaymentLink, { method: "POST", body: JSON.stringify(body) }),

  settlements: (limit?: number) => request(`/settlements${qs({ limit })}`, paginated(Settlement)),
  settlement: (id: string) => request(`/settlements/${id}`, Settlement),

  disputes: (limit?: number) => request(`/disputes${qs({ limit })}`, paginated(Dispute)),
};
