# Payla

A **fictional payments dashboard** (think Mollie) built to demo the **OpenCX
Companion** agent doing real work: reading a merchant's data and taking actions
(refunds, payment links) against a live backend — all from the embedded chat
widget.

- **Frontend** — Vite + React SPA wearing Mollie's design language (warm
  neutrals, Inter, near-black buttons, blue accent, 8/12px radii).
- **Backend** — a Cloudflare Worker (Hono) + D1 with a real, mutable data model.
- **Actions** — every endpoint is described in OpenAPI at `/openapi.json`, ready
  to import into OpenCX as agent tools.
- **Knowledge** — merchant help docs in [`kb/`](./kb) to train the agent.
- **Widget** — the OpenCX `@opencx/widget@5` embed, wired to pass merchant +
  page context to the agent.

> Payla is not a real company. The name, brand and data are invented; the design
> is Mollie-inspired for demo fidelity only.

## Architecture

One Cloudflare Worker serves both the SPA and the API. `run_worker_first` routes
`/api/*`, `/openapi.json` and `/health` to the Worker; everything else is served
as the single-page app.

```
Browser ──> Worker (Hono)
             ├── /api/*        → D1 (payments, refunds, customers, …)
             ├── /openapi.json → agent action spec (dynamic origin)
             └── else          → SPA assets (dist/client)
Widget  ──> OpenCX agent ──(actions)──> same /api/* endpoints
```

## Project structure

```
worker/        Hono API, D1 access layer, OpenAPI builder, Worker entry
shared/        Zod schemas + types shared by the API and the app
src/           React SPA (design system, pages, query hooks, widget loader)
migrations/    0001 schema + 0002 seed (deterministic demo data)
kb/            Help-center articles to train the agent
scripts/       Seed generator
```

## Local development

```bash
pnpm install
pnpm exec wrangler d1 migrations apply payla --local   # schema + seed into local D1
pnpm dev                                               # http://localhost:5173
```

Smoke-test the API / actions:

```bash
curl localhost:5173/api/balance
curl "localhost:5173/api/payments?status=paid&limit=3"
curl -X POST localhost:5173/api/payments/<id>/refunds -d '{"amount":5,"reason":"test"}'
```

Regenerate demo data after editing `scripts/gen-seed.mjs`:

```bash
node scripts/gen-seed.mjs
```

## Deploy to Cloudflare

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create payla         # copy the printed database_id …
#   … into wrangler.jsonc → d1_databases[0].database_id
pnpm exec wrangler d1 migrations apply payla --remote   # schema + seed on the remote DB
pnpm deploy                                # typecheck + vite build + wrangler deploy
```

Your app is now live at `https://payla.<subdomain>.workers.dev`, with the actions
spec at `https://payla.<subdomain>.workers.dev/openapi.json`.

To require an API key for write actions:

```bash
pnpm exec wrangler secret put PAYLA_API_KEY   # then send it as `Authorization: Bearer <key>`
```

## Wire the OpenCX Companion agent

### 1. Embed the widget

Create `.env` (values from OpenCX → Channels → Configure → Widget → *Embed for =
your agent* → Snippet):

```
VITE_OPENCX_WIDGET_TOKEN=<widget token>
VITE_OPENCX_AGENT_ID=<agent-v3 agent id>
VITE_OPENCX_BOT_NAME=Payla Assistant
```

Rebuild/redeploy. The loader ([`src/components/CompanionWidget.tsx`](./src/components/CompanionWidget.tsx))
injects `@opencx/widget@5` and calls `initOpenScript({ token, agentId, bot,
context })`, passing `{ merchant, page }` as **context** — forwarded to the agent
as `clientContext` on every message.

### 2. Give the agent its actions

In OpenCX → Agents → your agent → **Actions**, import from OpenAPI using your
deployed spec URL:

```
https://payla.<subdomain>.workers.dev/openapi.json
```

Each `operationId` becomes a tool: `get_balance`, `list_payments`, `get_payment`,
`refund_payment`, `create_payment_link`, `list_settlements`, `list_disputes`, and
more. If you set `PAYLA_API_KEY`, add it as the action auth (bearer).

### 3. Train it on the knowledge base

Upload the articles in [`kb/`](./kb) as a knowledge source / datasource for the
agent (refunds, statuses, payouts, disputes, methods, links, verification, fees).
They're written to match exactly how the API behaves, so the agent's answers and
its actions stay consistent.

### 4. Try it

Open the dashboard and ask the assistant:

- "What's my available balance?"
- "Show me failed payments this week."
- "Refund €5 on payment `tr_…`."
- "Create a payment link for €49.99 for a wholesale order."
- "Do I have any open disputes?"

## Actions reference

| Action (operationId) | Method + path | Writes? |
| --- | --- | --- |
| `get_balance` | `GET /api/balance` | |
| `get_business_metrics` | `GET /api/metrics` | |
| `list_payments` | `GET /api/payments` | |
| `get_payment` | `GET /api/payments/:id` | |
| `refund_payment` | `POST /api/payments/:id/refunds` | ✅ |
| `list_refunds` | `GET /api/refunds` | |
| `list_customers` | `GET /api/customers` | |
| `get_customer` | `GET /api/customers/:id` | |
| `list_payment_links` | `GET /api/payment-links` | |
| `create_payment_link` | `POST /api/payment-links` | ✅ |
| `list_settlements` | `GET /api/settlements` | |
| `get_settlement` | `GET /api/settlements/:id` | |
| `list_disputes` | `GET /api/disputes` | |
| `get_settings` | `GET /api/settings` | |
