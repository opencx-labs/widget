// Generates migrations/0002_seed.sql — deterministic, realistic demo data for Payla.
// Merchant persona: "Mo's Coffee Roasters" (a specialty coffee e-commerce store).
// Run: node scripts/gen-seed.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "migrations", "0002_seed.sql");

// --- tiny seeded PRNG so output is stable across runs ---
let _s = 0x9e3779b9;
const rand = () => {
  _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0;
  return _s / 0xffffffff;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const weighted = (pairs) => {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[0][0];
};

const now = Date.now();
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const sql = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const rows = [];
const stmt = (table, cols, values) =>
  rows.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${values.join(", ")});`);

// --- customers ---
const CUSTOMERS = [
  ["Lotte de Vries", "lotte.devries@example.com", "nl_NL"],
  ["James Okafor", "james.okafor@example.co.uk", "en_GB"],
  ["Sofia Marchetti", "sofia.marchetti@example.it", "it_IT"],
  ["Daniel Kremer", "daniel.kremer@example.de", "de_DE"],
  ["Amara Nwosu", "amara.nwosu@example.com", "en_US"],
  ["Pieter Bakker", "pieter.bakker@example.nl", "nl_NL"],
  ["Chloé Dubois", "chloe.dubois@example.fr", "fr_FR"],
  ["Yuki Tanaka", "yuki.tanaka@example.com", "en_US"],
  ["Emma Johansson", "emma.johansson@example.se", "sv_SE"],
  ["Marco Silva", "marco.silva@example.pt", "pt_PT"],
];
const customerIds = [];
CUSTOMERS.forEach(([name, email, locale], i) => {
  const id = `cst_${String(4100 + i * 7).padStart(6, "0")}`;
  customerIds.push(id);
  stmt("customers", ["id", "name", "email", "locale", "created_at"],
    [sql(id), sql(name), sql(email), sql(locale), sql(iso(now - int(40, 400) * DAY))]);
});

// --- settlements (older windows are paid out; recent are pending/open) ---
const settlements = [];
for (let i = 0; i < 6; i++) {
  const id = `stl_${String(9000 + i).padStart(6, "0")}`;
  const daysAgo = i * 7 + 1;
  const status = i === 0 ? "open" : i === 1 ? "pending" : "paidout";
  const settledAt = status === "paidout" ? iso(now - daysAgo * DAY + DAY) : null;
  settlements.push({ id, status });
  stmt("settlements",
    ["id", "reference", "amount_cents", "currency", "status", "created_at", "settled_at"],
    [sql(id), sql(`1180.${String(1000 + i).slice(1)}.${2026}`), 0, sql("EUR"), sql(status),
     sql(iso(now - daysAgo * DAY)), sql(settledAt)]);
}
const settlementCents = Object.fromEntries(settlements.map((s) => [s.id, 0]));
const settlementCount = Object.fromEntries(settlements.map((s) => [s.id, 0]));

// --- products (drive descriptions + realistic amounts in cents) ---
const PRODUCTS = [
  ["Ethiopia Yirgacheffe 1kg", 3200],
  ["House Espresso Blend 500g", 1450],
  ["Colombia Supremo 1kg", 2900],
  ["Cold Brew 6-pack", 2400],
  ["Monthly beans subscription", 2200],
  ["Barista starter kit", 8900],
  ["Decaf Swiss Water 500g", 1650],
  ["Gift card", 5000],
  ["Ceramic pour-over dripper", 2750],
  ["Single-origin sampler box", 3600],
];

// --- payments ---
const methodWeights = [
  ["ideal", 45], ["creditcard", 24], ["paypal", 12], ["bancontact", 8],
  ["applepay", 5], ["klarna", 3], ["banktransfer", 2], ["sofort", 1],
];
const paidPayments = [];
const N = 78;
for (let i = 0; i < N; i++) {
  const id = `tr_${String(20260000 + i * 137).padStart(10, "0")}`;
  const [desc, price] = pick(PRODUCTS);
  const qty = weighted([[1, 60], [2, 25], [3, 10], [4, 5]]);
  const amount = price * qty;
  const createdMs = now - int(0, 44) * DAY - int(0, 82_800) * 1000;
  const method = weighted(methodWeights);
  // status distribution
  const status = weighted([
    ["paid", 66], ["open", 6], ["pending", 4], ["failed", 8],
    ["expired", 5], ["canceled", 4], ["refunded", 3], ["partially_refunded", 3], ["charged_back", 1],
  ]);
  const isSettled = ["paid", "refunded", "partially_refunded", "charged_back"].includes(status);
  const paidAt = isSettled ? iso(createdMs + int(2, 90) * 1000) : null;
  const custId = rand() < 0.8 ? pick(customerIds) : null;

  // assign to a settlement if paid & older than 1 day
  let settlementId = null;
  if (isSettled && now - createdMs > DAY) {
    const s = pick(settlements.filter((x) => x.status !== "open")) || settlements[2];
    settlementId = s.id;
    settlementCents[s.id] += amount;
    settlementCount[s.id] += 1;
  }

  let refunded = 0;
  if (status === "refunded") refunded = amount;
  if (status === "partially_refunded") refunded = Math.round(amount * pick([0.25, 0.5, 0.5, 0.33]));

  stmt("payments",
    ["id", "status", "amount_cents", "amount_refunded_cents", "currency", "method",
     "description", "customer_id", "settlement_id", "created_at", "paid_at"],
    [sql(id), sql(status), amount, refunded, sql("EUR"), sql(method),
     sql(desc), sql(custId), sql(settlementId), sql(iso(createdMs)), sql(paidAt)]);

  if (status === "paid" || status === "partially_refunded") paidPayments.push({ id, amount, createdMs, custId });

  // refunds
  if (refunded > 0) {
    const rid = `re_${String(30000 + i).padStart(8, "0")}`;
    stmt("refunds",
      ["id", "payment_id", "amount_cents", "currency", "status", "reason", "created_at"],
      [sql(rid), sql(id), refunded, sql("EUR"), sql("refunded"),
       sql(pick(["Customer request", "Item out of stock", "Damaged in transit", "Duplicate order", null])),
       sql(iso(createdMs + int(1, 6) * DAY))]);
  }
}

// settlement totals
for (const s of settlements) {
  rows.push(`UPDATE settlements SET amount_cents = ${settlementCents[s.id]} WHERE id = ${sql(s.id)};`);
}

// --- payment links ---
const LINKS = [
  ["Wholesale invoice — Café Nero", 24000, "paid"],
  ["Event catering deposit", 15000, "active"],
  ["Roastery tour — 4 tickets", 8000, "paid"],
  ["Custom blend consultation", 6500, "active"],
  ["Holiday gift bundle", 4500, "expired"],
  ["Subscription top-up", 2200, "active"],
];
LINKS.forEach(([desc, cents, status], i) => {
  const id = `pl_${String(50000 + i * 11).padStart(8, "0")}`;
  const createdMs = now - int(2, 30) * DAY;
  const paidAt = status === "paid" ? iso(createdMs + int(1, 4) * DAY) : null;
  stmt("payment_links",
    ["id", "description", "amount_cents", "currency", "status", "url", "created_at", "paid_at"],
    [sql(id), sql(desc), cents, sql("EUR"), sql(status),
     sql(`https://pay.payla.dev/${id.slice(3)}`), sql(iso(createdMs)), sql(paidAt)]);
});

// --- disputes (on paid payments) ---
const disputeReasons = ["fraudulent", "product_not_received", "duplicate", "subscription_canceled", "general"];
const disputeStatuses = ["open", "under_review", "won", "lost"];
for (let i = 0; i < 4 && i < paidPayments.length; i++) {
  const p = paidPayments[int(0, paidPayments.length - 1)];
  const id = `chb_${String(70000 + i).padStart(8, "0")}`;
  const status = disputeStatuses[i];
  const createdMs = p.createdMs + int(3, 15) * DAY;
  stmt("disputes",
    ["id", "payment_id", "amount_cents", "currency", "reason", "status", "created_at", "due_at"],
    [sql(id), sql(p.id), p.amount, sql("EUR"), sql(disputeReasons[i % disputeReasons.length]),
     sql(status), sql(iso(createdMs)),
     sql(status === "open" || status === "under_review" ? iso(createdMs + 14 * DAY) : null)]);
}

// --- balance: open settlement total = pending; a slice already available ---
const openTotal = settlementCents[settlements[0].id] + settlementCents[settlements[1].id];
const available = Math.round(openTotal * 0.35) + int(120_00, 480_00);
stmt("balance", ["id", "available_cents", "pending_cents", "currency"],
  [1, available, openTotal, sql("EUR")]);

// --- settings ---
stmt("settings",
  ["id", "merchant_name", "merchant_id", "email", "country", "payout_schedule", "statement_descriptor", "test_mode"],
  [1, sql("Mo's Coffee Roasters"), sql("org_payla_demo"), sql("owner@moscoffee.example"),
   sql("NL"), sql("daily"), sql("MOS COFFEE"), 0]);

const header = `-- AUTO-GENERATED by scripts/gen-seed.mjs — do not edit by hand.\n-- Deterministic demo data for "Mo's Coffee Roasters".\n\n`;
writeFileSync(OUT, header + rows.join("\n") + "\n");
console.log(`Wrote ${rows.length} statements to ${OUT}`);
