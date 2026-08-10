// Payla REST API (Hono, on Cloudflare Workers).
// These same endpoints double as the OpenCX agent "actions" — see openapi/payla-actions.json.
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import {
  CreatePaymentInput,
  CreatePaymentLinkInput,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  RefundPaymentInput,
} from "../shared/types.ts";
import { majorToCents, PaylaDb } from "./db.ts";
import type { Env } from "./env.ts";

const app = new Hono<{ Bindings: Env; Variables: { db: PaylaDb } }>();

app.use("/api/*", cors());

// Attach a DB helper to every /api request.
app.use("/api/*", async (c, next) => {
  c.set("db", new PaylaDb(c.env.DB));
  await next();
});

// Require the API key for mutations, but only if one is configured.
app.use("/api/*", async (c, next) => {
  const mutates = c.req.method === "POST" || c.req.method === "PATCH" || c.req.method === "DELETE";
  const key = c.env.PAYLA_API_KEY;
  if (mutates && key) {
    const auth = c.req.header("authorization");
    const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7) : undefined;
    const provided = bearer ?? c.req.header("x-api-key");
    if (provided !== key) {
      return c.json({ error: { type: "unauthorized", message: "Invalid or missing API key." } }, 401);
    }
  }
  await next();
});

const clampLimit = (raw: string | undefined, fallback = 50) => {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, 1), 250);
};

const badRequest = (c: Context, message: string, details?: unknown) =>
  c.json({ error: { type: "invalid_request", message, details } }, 422);

app.get("/health", (c) => c.json({ status: "ok", service: "payla" }));

// A tiny self-describing index so hitting /api in a browser is friendly.
app.get("/api", (c) =>
  c.json({
    service: "Payla API",
    merchant: { name: c.env.MERCHANT_NAME, id: c.env.MERCHANT_ID },
    endpoints: [
      "GET /api/metrics",
      "GET /api/balance",
      "GET /api/payments",
      "GET /api/payments/:id",
      "POST /api/payments",
      "POST /api/payments/:id/refunds",
      "GET /api/refunds",
      "GET /api/customers",
      "GET /api/customers/:id",
      "GET /api/payment-links",
      "POST /api/payment-links",
      "GET /api/settlements",
      "GET /api/settlements/:id",
      "GET /api/disputes",
      "GET /api/settings",
    ],
    openapi: "/openapi.json",
  }),
);

app.get("/api/metrics", async (c) => c.json(await c.var.db.getMetrics()));

app.get("/api/balance", async (c) => c.json(await c.var.db.getBalance()));

app.get("/api/payments", async (c) => {
  const status = c.req.query("status");
  const method = c.req.query("method");
  if (status && !PAYMENT_STATUSES.some((s) => s === status)) {
    return badRequest(c, `Unknown status "${status}".`);
  }
  if (method && !PAYMENT_METHODS.some((m) => m === method)) {
    return badRequest(c, `Unknown method "${method}".`);
  }
  const { data, total } = await c.var.db.listPayments({
    status,
    method,
    customerId: c.req.query("customer"),
    limit: clampLimit(c.req.query("limit")),
  });
  return c.json({ data, meta: { count: data.length, total } });
});

app.get("/api/payments/:id", async (c) => {
  const payment = await c.var.db.getPayment(c.req.param("id"));
  if (!payment) return c.json({ error: { type: "not_found", message: "Payment not found." } }, 404);
  const refunds = await c.var.db.listRefundsForPayment(payment.id);
  return c.json({ ...payment, refunds });
});

app.post("/api/payments", async (c) => {
  const body = CreatePaymentInput.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return badRequest(c, "Invalid payment payload.", body.error.flatten());
  const created = await c.var.db.createPayment(body.data);
  return c.json(created, 201);
});

app.post("/api/payments/:id/refunds", async (c) => {
  const payment = await c.var.db.getPayment(c.req.param("id"));
  if (!payment) return c.json({ error: { type: "not_found", message: "Payment not found." } }, 404);

  const body = RefundPaymentInput.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return badRequest(c, "Invalid refund payload.", body.error.flatten());

  if (payment.status !== "paid" && payment.status !== "partially_refunded") {
    return badRequest(c, `Payment ${payment.id} is ${payment.status} and cannot be refunded.`);
  }
  const remainingCents = majorToCents(Number(payment.amount.value)) - majorToCents(Number(payment.amountRefunded.value));
  const requestedCents = body.data.amount ? majorToCents(body.data.amount) : remainingCents;
  if (requestedCents <= 0) return badRequest(c, "Refund amount must be positive.");
  if (requestedCents > remainingCents) {
    return badRequest(
      c,
      `Refund of ${(requestedCents / 100).toFixed(2)} exceeds the refundable ${(remainingCents / 100).toFixed(2)} ${payment.amount.currency}.`,
    );
  }
  const refund = await c.var.db.createRefund(payment, requestedCents, body.data.reason ?? null);
  const updated = await c.var.db.getPayment(payment.id);
  return c.json({ refund, payment: updated }, 201);
});

app.get("/api/refunds", async (c) => {
  const data = await c.var.db.listRefunds(clampLimit(c.req.query("limit")));
  return c.json({ data, meta: { count: data.length, total: data.length } });
});

app.get("/api/customers", async (c) => {
  const { data, total } = await c.var.db.listCustomers(clampLimit(c.req.query("limit")));
  return c.json({ data, meta: { count: data.length, total } });
});

app.get("/api/customers/:id", async (c) => {
  const customer = await c.var.db.getCustomer(c.req.param("id"));
  if (!customer) return c.json({ error: { type: "not_found", message: "Customer not found." } }, 404);
  const payments = await c.var.db.listPayments({ customerId: customer.id, limit: 20 });
  return c.json({ ...customer, payments: payments.data });
});

app.get("/api/payment-links", async (c) => {
  const data = await c.var.db.listPaymentLinks(clampLimit(c.req.query("limit")));
  return c.json({ data, meta: { count: data.length, total: data.length } });
});

app.post("/api/payment-links", async (c) => {
  const body = CreatePaymentLinkInput.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return badRequest(c, "Invalid payment-link payload.", body.error.flatten());
  const link = await c.var.db.createPaymentLink(body.data.description, majorToCents(body.data.amount));
  return c.json(link, 201);
});

app.get("/api/settlements", async (c) => {
  const data = await c.var.db.listSettlements(clampLimit(c.req.query("limit")));
  return c.json({ data, meta: { count: data.length, total: data.length } });
});

app.get("/api/settlements/:id", async (c) => {
  const settlement = await c.var.db.getSettlement(c.req.param("id"));
  if (!settlement) return c.json({ error: { type: "not_found", message: "Settlement not found." } }, 404);
  return c.json(settlement);
});

app.get("/api/disputes", async (c) => {
  const data = await c.var.db.listDisputes(clampLimit(c.req.query("limit")));
  return c.json({ data, meta: { count: data.length, total: data.length } });
});

app.get("/api/settings", async (c) => {
  const settings = await c.var.db.getSettings();
  if (!settings) return c.json({ error: { type: "not_found", message: "Settings not found." } }, 404);
  return c.json(settings);
});

export default app;
