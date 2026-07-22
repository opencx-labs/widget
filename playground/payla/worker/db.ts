// D1 access layer for Payla: typed row shapes + mappers to the shared DTO types.
// Rows are parsed through the shared Zod schemas so DB enum strings are validated at
// the boundary (no `as` casts) — a bad status in the DB fails loudly here, not in the UI.
import {
  Customer,
  Dispute,
  Payment,
  PaymentLink,
  type PaymentStatus,
  Refund,
  Settlement,
  Settings,
  type Balance,
  type Metrics,
  type MetricsPoint,
  type Money,
} from "../shared/types.ts";

export const centsToMoney = (cents: number, currency = "EUR"): Money => ({
  value: (cents / 100).toFixed(2),
  currency,
});

/** major units (e.g. 49.99) -> integer cents, rounded to avoid float drift. */
export const majorToCents = (value: number): number => Math.round(value * 100);

interface PaymentRow {
  id: string;
  status: string;
  amount_cents: number;
  amount_refunded_cents: number;
  currency: string;
  method: string | null;
  description: string;
  customer_id: string | null;
  customer_name: string | null;
  settlement_id: string | null;
  created_at: string;
  paid_at: string | null;
}
interface CustomerRow {
  id: string;
  name: string;
  email: string;
  locale: string;
  created_at: string;
  payments_count: number;
  total_spent_cents: number;
}
interface RefundRow {
  id: string;
  payment_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  reason: string | null;
  created_at: string;
}
interface PaymentLinkRow {
  id: string;
  description: string;
  amount_cents: number;
  currency: string;
  status: string;
  url: string;
  created_at: string;
  paid_at: string | null;
}
interface SettlementRow {
  id: string;
  reference: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  settled_at: string | null;
  payments_count: number;
}
interface DisputeRow {
  id: string;
  payment_id: string;
  amount_cents: number;
  currency: string;
  reason: string;
  status: string;
  created_at: string;
  due_at: string | null;
}

const mapPayment = (r: PaymentRow): Payment =>
  Payment.parse({
    id: r.id,
    status: r.status,
    amount: centsToMoney(r.amount_cents, r.currency),
    amountRefunded: centsToMoney(r.amount_refunded_cents, r.currency),
    method: r.method,
    description: r.description,
    customerId: r.customer_id,
    customerName: r.customer_name,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    settlementId: r.settlement_id,
  });

const mapCustomer = (r: CustomerRow): Customer =>
  Customer.parse({
    id: r.id,
    name: r.name,
    email: r.email,
    locale: r.locale,
    createdAt: r.created_at,
    paymentsCount: r.payments_count ?? 0,
    totalSpent: centsToMoney(r.total_spent_cents ?? 0),
  });

const mapRefund = (r: RefundRow): Refund =>
  Refund.parse({
    id: r.id,
    paymentId: r.payment_id,
    amount: centsToMoney(r.amount_cents, r.currency),
    status: r.status,
    reason: r.reason,
    createdAt: r.created_at,
  });

const mapPaymentLink = (r: PaymentLinkRow): PaymentLink =>
  PaymentLink.parse({
    id: r.id,
    description: r.description,
    amount: centsToMoney(r.amount_cents, r.currency),
    status: r.status,
    url: r.url,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  });

const mapSettlement = (r: SettlementRow): Settlement =>
  Settlement.parse({
    id: r.id,
    reference: r.reference,
    amount: centsToMoney(r.amount_cents, r.currency),
    status: r.status,
    createdAt: r.created_at,
    settledAt: r.settled_at,
    paymentsCount: r.payments_count ?? 0,
  });

const mapDispute = (r: DisputeRow): Dispute =>
  Dispute.parse({
    id: r.id,
    paymentId: r.payment_id,
    amount: centsToMoney(r.amount_cents, r.currency),
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    dueAt: r.due_at,
  });

const PAYMENT_SELECT = `
  SELECT p.*, c.name AS customer_name
  FROM payments p
  LEFT JOIN customers c ON c.id = p.customer_id
`;

export class PaylaDb {
  constructor(private db: D1Database) {}

  async listPayments(opts: { status?: string; method?: string; customerId?: string; limit: number }) {
    const where: string[] = [];
    const binds: unknown[] = [];
    if (opts.status) { where.push("p.status = ?"); binds.push(opts.status); }
    if (opts.method) { where.push("p.method = ?"); binds.push(opts.method); }
    if (opts.customerId) { where.push("p.customer_id = ?"); binds.push(opts.customerId); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM payments p ${clause}`)
      .bind(...binds)
      .first<{ n: number }>();
    const res = await this.db
      .prepare(`${PAYMENT_SELECT} ${clause} ORDER BY p.created_at DESC LIMIT ?`)
      .bind(...binds, opts.limit)
      .all<PaymentRow>();
    return { data: res.results.map(mapPayment), total: total?.n ?? res.results.length };
  }

  async getPayment(id: string): Promise<Payment | null> {
    const row = await this.db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).bind(id).first<PaymentRow>();
    return row ? mapPayment(row) : null;
  }

  async listRefundsForPayment(paymentId: string): Promise<Refund[]> {
    const res = await this.db
      .prepare(`SELECT * FROM refunds WHERE payment_id = ? ORDER BY created_at DESC`)
      .bind(paymentId)
      .all<RefundRow>();
    return res.results.map(mapRefund);
  }

  async listRefunds(limit: number): Promise<Refund[]> {
    const res = await this.db
      .prepare(`SELECT * FROM refunds ORDER BY created_at DESC LIMIT ?`)
      .bind(limit)
      .all<RefundRow>();
    return res.results.map(mapRefund);
  }

  async createRefund(payment: Payment, amountCents: number, reason: string | null): Promise<Refund> {
    const id = `re_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const createdAt = new Date().toISOString();
    const newRefunded = majorToCents(Number(payment.amountRefunded.value)) + amountCents;
    const paymentTotal = majorToCents(Number(payment.amount.value));
    const newStatus: PaymentStatus = newRefunded >= paymentTotal ? "refunded" : "partially_refunded";
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO refunds (id, payment_id, amount_cents, currency, status, reason, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(id, payment.id, amountCents, payment.amount.currency, reason, createdAt),
      this.db
        .prepare(`UPDATE payments SET amount_refunded_cents = ?, status = ? WHERE id = ?`)
        .bind(newRefunded, newStatus, payment.id),
    ]);
    return {
      id,
      paymentId: payment.id,
      amount: centsToMoney(amountCents, payment.amount.currency),
      status: "pending",
      reason,
      createdAt,
    };
  }

  async createPayment(input: {
    amount: number;
    description: string;
    method?: string;
    customerId?: string;
  }): Promise<Payment> {
    const id = `tr_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const createdAt = new Date().toISOString();
    const amountCents = majorToCents(input.amount);
    await this.db
      .prepare(
        `INSERT INTO payments (id, status, amount_cents, amount_refunded_cents, currency, method,
           description, customer_id, settlement_id, created_at, paid_at)
         VALUES (?, 'open', ?, 0, 'EUR', ?, ?, ?, NULL, ?, NULL)`,
      )
      .bind(id, amountCents, input.method ?? null, input.description, input.customerId ?? null, createdAt)
      .run();
    const created = await this.getPayment(id);
    if (!created) throw new Error(`Failed to create payment ${id}`);
    return created;
  }

  async listCustomers(limit: number) {
    const total = await this.db.prepare(`SELECT COUNT(*) AS n FROM customers`).first<{ n: number }>();
    const res = await this.db
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM payments p WHERE p.customer_id = c.id) AS payments_count,
           (SELECT COALESCE(SUM(amount_cents - amount_refunded_cents), 0) FROM payments p
              WHERE p.customer_id = c.id AND p.status IN ('paid','partially_refunded')) AS total_spent_cents
         FROM customers c
         ORDER BY total_spent_cents DESC LIMIT ?`,
      )
      .bind(limit)
      .all<CustomerRow>();
    return { data: res.results.map(mapCustomer), total: total?.n ?? res.results.length };
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const row = await this.db
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM payments p WHERE p.customer_id = c.id) AS payments_count,
           (SELECT COALESCE(SUM(amount_cents - amount_refunded_cents), 0) FROM payments p
              WHERE p.customer_id = c.id AND p.status IN ('paid','partially_refunded')) AS total_spent_cents
         FROM customers c WHERE c.id = ?`,
      )
      .bind(id)
      .first<CustomerRow>();
    return row ? mapCustomer(row) : null;
  }

  async listPaymentLinks(limit: number): Promise<PaymentLink[]> {
    const res = await this.db
      .prepare(`SELECT * FROM payment_links ORDER BY created_at DESC LIMIT ?`)
      .bind(limit)
      .all<PaymentLinkRow>();
    return res.results.map(mapPaymentLink);
  }

  async createPaymentLink(description: string, amountCents: number): Promise<PaymentLink> {
    const id = `pl_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const createdAt = new Date().toISOString();
    const url = `https://pay.payla.dev/${id.slice(3)}`;
    await this.db
      .prepare(
        `INSERT INTO payment_links (id, description, amount_cents, currency, status, url, created_at)
         VALUES (?, ?, ?, 'EUR', 'active', ?, ?)`,
      )
      .bind(id, description, amountCents, url, createdAt)
      .run();
    return {
      id,
      description,
      amount: centsToMoney(amountCents),
      status: "active",
      url,
      createdAt,
      paidAt: null,
    };
  }

  async listSettlements(limit: number): Promise<Settlement[]> {
    const res = await this.db
      .prepare(
        `SELECT s.*,
           (SELECT COUNT(*) FROM payments p WHERE p.settlement_id = s.id) AS payments_count
         FROM settlements s ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(limit)
      .all<SettlementRow>();
    return res.results.map(mapSettlement);
  }

  async getSettlement(id: string): Promise<Settlement | null> {
    const row = await this.db
      .prepare(
        `SELECT s.*,
           (SELECT COUNT(*) FROM payments p WHERE p.settlement_id = s.id) AS payments_count
         FROM settlements s WHERE s.id = ?`,
      )
      .bind(id)
      .first<SettlementRow>();
    return row ? mapSettlement(row) : null;
  }

  async listDisputes(limit: number): Promise<Dispute[]> {
    const res = await this.db
      .prepare(`SELECT * FROM disputes ORDER BY created_at DESC LIMIT ?`)
      .bind(limit)
      .all<DisputeRow>();
    return res.results.map(mapDispute);
  }

  async getBalance(currency = "EUR"): Promise<Balance> {
    const row = await this.db
      .prepare(`SELECT available_cents, pending_cents, currency FROM balance WHERE id = 1`)
      .first<{ available_cents: number; pending_cents: number; currency: string }>();
    return {
      available: centsToMoney(row?.available_cents ?? 0, row?.currency ?? currency),
      pending: centsToMoney(row?.pending_cents ?? 0, row?.currency ?? currency),
      currency: row?.currency ?? currency,
    };
  }

  async getMetrics(): Promise<Metrics> {
    const DAY = 86_400_000;
    const now = Date.now();
    const cut30 = new Date(now - 30 * DAY).toISOString();
    const cut60 = new Date(now - 60 * DAY).toISOString();
    const PAID = "('paid','partially_refunded')";

    const rev = async (from: string, to?: string) => {
      const clause = to ? "paid_at >= ? AND paid_at < ?" : "paid_at >= ?";
      const binds = to ? [from, to] : [from];
      const r = await this.db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents - amount_refunded_cents),0) AS c,
                  COUNT(*) AS n
           FROM payments WHERE status IN ${PAID} AND ${clause}`,
        )
        .bind(...binds)
        .first<{ c: number; n: number }>();
      return { cents: r?.c ?? 0, count: r?.n ?? 0 };
    };

    const cur = await rev(cut30);
    const prev = await rev(cut60, cut30);

    const outcome = await this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status IN ('paid','partially_refunded','refunded') THEN 1 ELSE 0 END) AS ok,
           SUM(CASE WHEN status IN ('failed','expired','canceled') THEN 1 ELSE 0 END) AS bad,
           COUNT(*) AS total
         FROM payments WHERE created_at >= ?`,
      )
      .bind(cut30)
      .first<{ ok: number; bad: number; total: number }>();
    const decided = (outcome?.ok ?? 0) + (outcome?.bad ?? 0);
    const successRate = decided > 0 ? (outcome?.ok ?? 0) / decided : 0;

    const disputes = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM disputes WHERE status IN ('open','under_review')`)
      .first<{ n: number }>();

    const daily = await this.db
      .prepare(
        `SELECT substr(paid_at,1,10) AS day, SUM(amount_cents - amount_refunded_cents) AS c
         FROM payments WHERE status IN ${PAID} AND paid_at >= ?
         GROUP BY day`,
      )
      .bind(cut30)
      .all<{ day: string; c: number }>();
    const byDay = new Map(daily.results.map((r) => [r.day, r.c]));
    const series: MetricsPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now - i * DAY).toISOString().slice(0, 10);
      series.push({ date: day, amount: (byDay.get(day) ?? 0) / 100 });
    }

    const methods = await this.db
      .prepare(
        `SELECT method, SUM(amount_cents - amount_refunded_cents) AS c, COUNT(*) AS n
         FROM payments WHERE status IN ${PAID} AND paid_at >= ? AND method IS NOT NULL
         GROUP BY method ORDER BY c DESC`,
      )
      .bind(cut30)
      .all<{ method: string; c: number; n: number }>();

    return {
      revenue30d: centsToMoney(cur.cents),
      revenuePrev30d: centsToMoney(prev.cents),
      paymentsCount30d: outcome?.total ?? 0,
      successRate,
      avgOrderValue: centsToMoney(cur.count > 0 ? Math.round(cur.cents / cur.count) : 0),
      openDisputes: disputes?.n ?? 0,
      series,
      methodBreakdown: methods.results.map((m) => ({
        method: Payment.shape.method.unwrap().parse(m.method),
        amount: centsToMoney(m.c),
        count: m.n,
      })),
    };
  }

  async getSettings(): Promise<Settings | null> {
    const row = await this.db
      .prepare(`SELECT * FROM settings WHERE id = 1`)
      .first<{
        merchant_name: string;
        merchant_id: string;
        email: string;
        country: string;
        payout_schedule: string;
        statement_descriptor: string;
        test_mode: number;
      }>();
    if (!row) return null;
    return Settings.parse({
      merchantName: row.merchant_name,
      merchantId: row.merchant_id,
      email: row.email,
      country: row.country,
      payoutSchedule: row.payout_schedule,
      statementDescriptor: row.statement_descriptor,
      testMode: row.test_mode === 1,
    });
  }
}
