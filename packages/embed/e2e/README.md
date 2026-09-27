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
