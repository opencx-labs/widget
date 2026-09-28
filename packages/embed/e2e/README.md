# Public integration compatibility

Sanitized reproductions of integration code inspected on 2026-09-26:

- https://support.trunkrs.nl/hc/nl — Dutch branding, greeting, required contact
  form and optional shipment/postcode fields; direct `@latest` script.
- https://www.deonlinedrogist.nl/ — lazy script injection, custom host launcher,
  MutationObserver, first iframe + `trigger/btn` selector, category context and
  host z-index overrides; `@latest` script.
- https://www.qoyod.com/ — Arabic/RTL, country-selected token, synthetic trigger
  click, delayed display/opacity/transform overrides, close reconciliation and
  iframe attribution CSS; cached `@latest` script.

These fixtures preserve the relevant integration patterns, not full copies of
the websites. Tokens and visitor data are synthetic; images are local placeholders.
Qoyod's WordPress/Rocket loader is replaced by a direct local script load, and its
redundant bubble-phase click handler is omitted (the capture handler stops it).
Trunkrs' two identical page-selected tokens are represented by one fake token.
Only the observed widget-related DeOnlineDrogist CSS is reproduced.

The production `dist-embed/script.js` is exercised in Chromium, Firefox and
WebKit. Public integration fixtures run at desktop and mobile viewport sizes
with normal motion; Companion runs with normal and reduced motion. Every browser request is intercepted;
unexpected requests fail the test. No API keys, production APIs, or AI calls.

From the repository root:

```sh
pnpm build
pnpm exec playwright install chromium firefox webkit
for browser in chromium firefox webkit; do
  WIDGET_TEST_BROWSER=$browser pnpm --filter @opencx/widget test:e2e || exit 1
done
```

Checks cover visible opening through customer launchers, contact collection,
message/reply flow, v2 delivery default despite backend streaming support,
page-context/client-tools default opt-out, closing, reopening, RTL, country token,
one root, and browser errors. Real keystrokes are used because Firefox's bulk
fill shortcut did not insert text into the newly opened iframe.

`release-readiness.e2e.mjs` also covers:

- Companion optional/required starter questions, first send, follow-up typing,
  visible footer, noncollapsed shell, and required-choice dismissal.
- Duplicate classic-script evaluation/reinitialization preserving the conversation
  and draft under an explicit CSP (self-only scripts/connections; inline authored
  styles and a nonced bootstrap). This is one tested policy, not every host CSP.
- Authenticated multipart v2 upload and attachment metadata in the next send.
- Microphone permission denial and typing afterward; a granted synthetic track
  stopping when the session-token request fails. No real device is opened.

These tests do not establish live-site behavior under consent managers, CDN caches,
real authentication, actual provider transcription, physical mobile browsers,
or arbitrary customer CSP/custom React components. Backend and media responses
are controlled fixtures.

## Rich replies and page features

`page-features.e2e.mjs` runs the production embed against a local HTTP server that
implements the widget wire contract and streams actual SSE events. It covers
popover and Companion rich cards/tables, history reload, unsafe links/HTML, page
context opt-out and opt-in, exclusion of private controls and field values,
pointing without action authority, and Allow/No paths for every action type.
Arabic clicks, auto-saving text/dropdowns, and checkbox changes must wait for
consent; proposed values are visible and a decline leaves the host unchanged.
An approved action must leave Companion open; a real visitor outside click still
closes it. Each case checks exact DOM outcomes and returned page replies.

Run with `WIDGET_TEST_BROWSER=chromium`, `firefox` or `webkit`:

```sh
node --test e2e/page-features.e2e.mjs
```

`WIDGET_E2E_DEBUG=1` logs the synthetic requests and rendered text for diagnosis.
All data is local and fake; unexpected external requests fail the test. These
cases do not test real backend authorization, settings persistence, model tool
selection or generic forms, which are absent from the rich-reply catalog.

## Private workspace downloads

`workspace-download.e2e.mjs` exercises the production embed in classic and
Companion layouts. Markdown links and rich-list links download the authenticated
file, including after a history reload. Checks cover exact file contents and
filename, authorization headers, staying on the host page, and blocking unexpected
external requests. Run the file with `WIDGET_TEST_BROWSER=chromium`, `firefox` or
`webkit`; each browser runs four cases. The local HTTP fixture uses synthetic
identities and files. Backend ownership and redaction checks live in the backend
integration tests, separately from this browser proof.

## Published v4 to candidate v5 differential tests

`v4-upgrade.upgrade.mjs` runs the **published npm v4.0.63 embed** first, then
opens the same page with the candidate production v5 bundle in the same browser
context. The
configuration factory (including callbacks and React components), visitor
storage, and backend conversation stay the same. A fresh v5 context also checks
the cold-start configuration and send payload against the v4 baseline.

The old document is closed after its assertions; the browser context stays alive
so storage and cookies survive. Error collection starts before either bundle
runs and stops before destroying its document. This separates WebKit's old-page
request-cancellation noise from v5 runtime errors. It tests a normal new page
load after upgrading the bundle, rather than replacing the running React tree.

Prepare the immutable baseline once, then build all workspace dependencies:

```sh
node scripts/prepare-v4-upgrade.mjs
pnpm build
for browser in chromium firefox webkit; do
  WIDGET_TEST_BROWSER=$browser pnpm --filter @opencx/widget test:upgrade || exit 1
done
```

Preparation verifies the pinned npm tarball's SHA-512 integrity and extracts only
`script.js` into ignored `local-pack/v4-upgrade/`. `WIDGET_V4_TARBALL` can point to
an already downloaded tarball for offline preparation. The suite never fetches a
bundle from a CDN, and no browser request can reach a real customer/backend.
`WIDGET_V4_BUNDLE` optionally selects a separately prepared baseline.

The 12 configurations each run at 1280×900 and 390×844:

| Profile            | Extra coverage beyond the shared checks                              |
| ------------------ | -------------------------------------------------------------------- |
| brand-form         | Name/email prefill, collection, shipment/postcode fields, PDF upload |
| rtl-required-above | Arabic/RTL, left launcher, mandatory first question                  |
| below-optional     | Dutch, questions below the greeting, free typing                     |
| custom-components  | React title, persistent/temporary greetings, resolved component      |
| custom-trigger     | Host React launcher, close callback and reopen                       |
| inline             | Embedded container and attachment upload                             |
| verified           | Config-provided widget-contact JWT and authenticated upload          |
| user-data          | Supplied name/email/external ID/custom contact data                  |
| session-list       | Conversation list, selection and one-open-session configuration      |
| long-content       | German, eight long prompts, sending gate configuration               |
| minimal            | Legacy minimal config with default UI                                |
| mode-canvas        | Custom legacy mode component and configured canvas size              |

Shared assertions cover CSS colors/fonts/radii, translated placeholder, safe
footer HTML and link target, React header/bottom/message components, legacy
`deliveredAt`, header expand/close/resolve actions, confirmation callbacks,
question gating, visitor identity, same conversation/history, sending and human
reply polling, and unchanged custom headers/context/body/message data. Attachment
comparisons validate generated IDs and compare the remaining metadata exactly.
Default configs must keep v2 delivery with page context/client tools/connections
disabled, even when the fixture advertises backend support.

An additional verified-user lifecycle case upgrades v4, renews the same owner's
JWT without losing the conversation, then switches contact and checks that the
old transcript is gone before the next send. This is **25 cases per engine**.

The backend fixture rejects protected requests without a contact bearer token.
This caught a regression where v5 initialization overwrote a restored anonymous
token with an empty config token. `WidgetProvider.identity.spec.tsx` also checks
that failure directly against the real transport on initialization and rerender.

Screenshots, style snapshots and synthetic request logs are written to
`<system-temp>/widget-upgrade-results/<engine>` (override with
`WIDGET_UPGRADE_OUTPUT`). These tests compare configured contracts; they do not
require the new default v5 design to be pixel-identical to v4. They do not prove
real backend authorization, AI behavior, every possible customer configuration,
or physical-device behavior. No stable package is published by these commands.
