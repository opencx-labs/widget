# Payla — local demo of the OpenCX Companion doing real actions

Payla is a fictional payments dashboard. It embeds the **OpenCX Companion
widget (built locally — not unpkg)**, pointed at a **local OpenCX**, whose seeded
**companion agent** reads Payla's data and takes real actions (refunds, payment links)
through HTTP actions.

Everything runs on `localhost` — **no deploy, no tunnels.**

- **Frontend** — Vite + React SPA with a clean warm-neutral payments-dashboard design.
- **Backend** — a Cloudflare Worker (Hono) + D1 with real, mutable data.
- **Widget** — `@opencx/widget` v5, copied from the local `packages/embed` build into
  `public/opencx-widget/script.js` by `scripts/sync-widget.mjs` (runs on `predev`/`prebuild`).

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

**Baked token — nothing to copy.** The seed pins the widget token
`payla-companion-demo-token` and the app defaults to exactly it
(`src/lib/widgetConfig.ts`). Fresh seed + fresh app → the widget just works. There is
no agent id: the org IS the agent, and the backend decides whether the embed streams.

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
NODE_ENV=test bun scripts/seed-payla-demo.ts   # seed the org + companion agent + actions + KB
pnpm ddev                               # → http://localhost:8080
```

The seed prints the org token (it matches the app's baked default).

### 2) Widget — repo `widget`, branch `osama/epic/widget-v5`

```bash
cd widget
pnpm install
pnpm build                              # builds @opencx/widget → packages/embed/dist-embed/script.js
```

### 3) Payla mock — `widget/playground/payla`

```bash
cd widget/playground/payla
pnpm install --ignore-workspace         # standalone (not a workspace member)
pnpm exec wrangler d1 migrations apply payla --local   # seed the mock's own data
pnpm dev                                # → http://localhost:5173  (predev copies the local widget)
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

| Action                            | Method + path                    | Writes? |
| --------------------------------- | -------------------------------- | ------- |
| `get_balance`                     | `GET /api/balance`               |         |
| `get_business_metrics`            | `GET /api/metrics`               |         |
| `list_payments`                   | `GET /api/payments`              |         |
| `get_payment`                     | `GET /api/payments/:id`          |         |
| `refund_payment`                  | `POST /api/payments/:id/refunds` | ✅      |
| `list_customers` / `get_customer` | `GET /api/customers[/:id]`       |         |
| `create_payment_link`             | `POST /api/payment-links`        | ✅      |
| `list_settlements`                | `GET /api/settlements`           |         |
| `list_disputes`                   | `GET /api/disputes`              |         |

Regenerate the mock data anytime: `pnpm exec wrangler d1 migrations apply payla --local`
(schema + seed live in `migrations/`). KB articles for the agent are in `kb/`.
