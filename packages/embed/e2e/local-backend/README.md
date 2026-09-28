# Real local backend verification

These opt-in checks exercise the running OpenCX backend using fresh synthetic
organizations, contacts, sessions and dashboard roles. They never target customer
organizations. `verify.mjs` requires Node 24, a local backend checkout, the same
local database as that server, and the server's local signing configuration.
The script rejects non-loopback HTTP targets and remote database overrides.

From the **backend** directory, with the isolated backend already running:

```sh
# Set this to the widget checkout being tested.
WIDGET_CHECKOUT=/absolute/path/to/widget
NODE_ENV=test \
LOCAL_POSTGRES_DB=opencx_widget_payla_0be5 \
TEST_POSTGRES_URL= NEON_POSTGRES_URL= \
REDIS_URL=redis://127.0.0.1:6389 \
WIDGET_LOCAL_BACKEND=http://127.0.0.1:8184 \
WIDGET_LOCAL_IDENTITIES=/tmp/widget-stability-identities.json \
node --experimental-transform-types --env-file=.env \
  "$WIDGET_CHECKOUT/packages/embed/e2e/local-backend/verify.mjs"
```

The report is `/tmp/widget-local-backend-results.json` (override with
`WIDGET_LOCAL_REPORT`). The separate identity file contains temporary local
credentials, is atomically replaced with mode `0600` even if a prior file is
more permissive, and must never be committed or shared. The writer never follows
an existing destination symlink. Its four local regressions run as part of the
embed package test command.
The synthetic records are retained in the isolated database for inspection.
When exporting identities, the verifier restores the synthetic org's feature
switches to on so the subsequent opt-in feature checks can use them.

After building the widget and preparing the published v4 bundle with
`scripts/prepare-v4-upgrade.mjs`, run from **packages/embed**:

```sh
WIDGET_LOCAL_IDENTITIES=/tmp/widget-stability-identities.json \
WIDGET_TEST_BROWSER=chromium \
node --test e2e/local-backend/identity.mjs
```

Repeat with `firefox` and `webkit`. The browser uses the real HTTP backend; only
the host page is a local fixture. Unexpected browser network destinations are
blocked. AI response generation is disabled in these fixture orgs: sends still use real
authentication, persistence and history routes, without a model dependency.
Response quality and streaming execution are separate checks.

## Coverage

- Every Advanced/Web boolean: save off/on, GET reload, effective runtime value,
  exposed widget configuration, preservation of other switches and org isolation.
- Read-only roles, foreign org selection, invalid values and all nine denied
  entitlements. Rejected mixed patches must not partially save.
- Concurrent independent feature updates; all twelve combinations of streaming,
  tool activity and reasoning; invalid presentation saves preserve prior settings.
- Real JWT same-contact renewal and expiry; foreign contact/org access rejected
  for history, polling, v5 messages and stop. Owner history is the positive control.
- Published v4 creates a real session; the current v5 bundle keeps it, renews the
  token, switches A → B → A, then reloads with the correct private history.

These verify settings and identity boundaries. They do not certify every action
of scheduling, sandbox execution, mini apps, dictation providers or page actions.

## Real dictation

`dictation.mjs` uses the production embed, local authentication and the backend's
configured transcription provider. It replaces device capture with a synthetic
spoken WAV streamed through real WebRTC; no physical microphone is opened.
This is an opt-in provider integration check, separate from the mocked customer
compatibility tests. It requires the local backend's existing provider setup.

Supply a nonempty WAV saying "Testing the local widget. Please check my payment
status." and run from **packages/embed**:

```sh
WIDGET_LIVE_DICTATION=true \
WIDGET_LOCAL_IDENTITIES=/tmp/widget-stability-identities.json \
WIDGET_LIVE_DICTATION_AUDIO=/tmp/widget-dictation-synthetic.wav \
WIDGET_TEST_BROWSER=chromium \
node --test e2e/local-backend/dictation.mjs
```

Repeat with `firefox` and `webkit`. Both classic popover and Companion must
receive actual transcript deltas, preserve typed text, avoid automatically
sending a message, and release tracks and peer connections on Stop and close.
Only the local host, local backend and provider handshake endpoint are allowed.
The normal release-readiness fixture separately verifies closing while the
credential request is still pending and remaining able to type after reopening.
