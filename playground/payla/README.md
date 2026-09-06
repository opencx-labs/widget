# Payla — local demo of the OpenCX Companion doing real actions

Payla is a fictional payments dashboard. It embeds the **OpenCX Companion
widget (built locally — not unpkg)**, pointed at a **local OpenCX**, whose seeded
**companion agent** reads Payla's data and takes real actions (refunds, payment links)
through HTTP actions.

Everything runs on `localhost` — **no deploy, no tunnels.**

- **Frontend** — Vite + React SPA with a clean warm-neutral payments-dashboard design.
- **Backend** — a Cloudflare Worker (Hono) + D1 with real, mutable data.
- **Widget** — `@opencx/widget` v5, copied from the local `packages/embed` build into
  `public/opencx-widget/` by `scripts/sync-widget.mjs` (runs on `predev`/`prebuild`). The
  whole `dist-embed/` travels: `script.js` is only the loader, and it injects `widget.js`
  plus its lazy chunks from the same directory.

## How it fits together

```
Browser  ──  localhost:5173  (Payla app)
  │  loads the widget from  /opencx-widget/script.js     (local build, no unpkg)
  │  widget apiUrl = http://localhost:8080               (browser → local OpenCX)
  ▼
OpenCX backend  ──  localhost:8080   ← companion agent "Payla Assistant" (seeded)
  │  the agent's actions call  http://localhost:5173/api/...   (backend → local Payla)
  ▼
Payla Worker + D1  ──  localhost:5173   ← the mock data (payments, refunds, settlements…)
```

**Baked token — nothing to copy.** `seed-opencx-companion.ts` writes the widget token
`opencx-local-companion-token`, and the app defaults to exactly it
(`src/lib/demo-defaults.json`, read by the app and by the `pnpm dev` pre-flight). Fresh
seed + fresh app → the widget just works. There is no agent id: the org IS the agent,
and the backend decides whether the embed streams.

## Prerequisites

- Docker, Node ≥ 20, pnpm, [`bun`](https://bun.sh) (for the seed script)
- An `OPENROUTER_API_KEY` with access to `openai/gpt-5.6-luna` (the v3 agent model)

## Run it (all local)

### 1) OpenCX backend — repo `opencx`, branch `osama/feat/companion-service`

```bash
cd opencx/backend
docker compose up -d
pnpm install
cp .env.example .env                    # set OPENROUTER_API_KEY
pnpm dev:prepare                        # migrate + codegen

# Seeds, in this order. The first creates the org and its widget token; the
# second turns that org into Payla; the third registers the HTTP actions.
NODE_ENV=test bun scripts/seed-opencx-companion.ts
NODE_ENV=test bun scripts/seed-payla-demo.ts
NODE_ENV=test bun scripts/seed-payla-actions.ts

pnpm ddev                               # → http://localhost:8080
```

Each seed is idempotent. The second prints the org token — it matches the app's baked
default, so there is nothing to copy. If you skip a seed, `pnpm dev` in step 3 says so
before the dashboard opens.

### 2) Widget — repo `widget` (this repo)

```bash
cd widget
pnpm install
pnpm build                              # builds @opencx/widget → packages/embed/dist-embed/
```

### 3) Payla mock — `widget/playground/payla`

```bash
cd widget/playground/payla
pnpm install --ignore-workspace         # standalone (not a workspace member)
pnpm dev                                # → http://localhost:5173  (predev copies the local widget and migrates + seeds the mock's D1)
```

Open **http://localhost:5173**. The Companion bubble (bottom-right) is the seeded agent.
Try:

- "What's my available balance?"
- "Show me failed payments this week."
- "Refund €5 on payment `tr_…`." (it'll confirm, then actually do it)
- Type `@` in the composer to mention a payment or customer by name (`mentions.search`
  in `CompanionWidget.tsx` searches the demo's own API); open a payment page and the
  composer shows it as a context pill ("this" to the agent).
- Copy any reply with the button under it; reload the page and the conversation is
  still open (`router.restoreLastSession`).
- "Do I have any open disputes?"

**Two surfaces, one token.** The dashboard mounts the COMPANION shell; **Help** in the
sidebar is a hard link to `/support`, the customer-facing help center, which mounts the
classic popover with the stock look and no merchant context. The widget boots once per
page load, so moving between them is a full navigation.

## Configuration

The widget's token and backend URL are **baked in code** (`src/lib/widgetConfig.ts`)
and match the seed, so there's nothing to configure. To point at a different OpenCX, set
`VITE_OPENCX_WIDGET_TOKEN` / `VITE_OPENCX_API_URL` in `.env`. There is no agent id: the
org is the agent, and the backend decides whether the embed streams.

## Notes / troubleshooting

- The browser (`:5173`) calls the OpenCX backend (`:8080`) cross-origin — the widget v5
  endpoints are built to be called from any customer origin, so this works. If the bubble
  can't connect, confirm the backend is on `:8080` and the token matches the seed.
- Actions execute **server-side** in the backend and call `:5173` on the same machine —
  no tunnel needed.
- The v3 agent model is `openai/gpt-5.6-luna` via OpenRouter; without `OPENROUTER_API_KEY`
  the widget loads but the agent won't answer.
- If you wiped the DB and the bubble shows a 401, clear `localhost:5173` site data (or use
  an incognito window) — the widget cached a visitor token for a contact that no longer exists.

## The mock API / agent actions

Every endpoint doubles as an agent action (spec at `/openapi.json`, imported by the seed):

| Action                                | Method + path                    | Writes? |
| ------------------------------------- | -------------------------------- | ------- |
| `get_balance`                         | `GET /api/balance`               |         |
| `get_business_metrics`                | `GET /api/metrics`               |         |
| `get_settings`                        | `GET /api/settings`              |         |
| `list_payments`                       | `GET /api/payments`              |         |
| `get_payment`                         | `GET /api/payments/:id`          |         |
| `refund_payment`                      | `POST /api/payments/:id/refunds` | ✅      |
| `list_refunds`                        | `GET /api/refunds`               |         |
| `list_customers` / `get_customer`     | `GET /api/customers[/:id]`       |         |
| `list_payment_links`                  | `GET /api/payment-links`         |         |
| `create_payment_link`                 | `POST /api/payment-links`        | ✅      |
| `list_settlements` / `get_settlement` | `GET /api/settlements[/:id]`     |         |
| `list_disputes`                       | `GET /api/disputes`              |         |

Mock data lives in `migrations/` (`0001_schema.sql`, `0002_seed.sql`); `pnpm dev` applies both
on first run. The seed clears every table before inserting, so it doubles as the reset:

- `pnpm db:seed:local` — put the data back to the seeded state.
- `pnpm db:seed:regen` — rewrite `0002_seed.sql` from `scripts/gen-seed.mjs` (dates are relative
  to today) and apply it. Running migrations would not: D1 records `0002` as applied once.

KB articles for the agent are in `kb/`.

`pnpm test` covers `scripts/sync-widget.mjs` (the widget mirror); `pnpm typecheck` type-checks
the app and the Worker.
