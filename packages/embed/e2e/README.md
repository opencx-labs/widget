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

The production `dist-embed/script.js` is exercised in Chromium at desktop and
mobile viewport sizes with normal motion. Every browser request is intercepted;
unexpected requests fail the test. No API keys, production APIs, or AI calls.

From the repository root:

```sh
pnpm build
pnpm exec playwright install chromium --only-shell
pnpm --filter @opencx/widget test:e2e
```

Checks cover visible opening through customer launchers, contact collection,
message/reply flow, v2 delivery default despite backend streaming support,
page-context/client-tools default opt-out, closing, reopening, RTL, country token,
one root, and browser errors. They do not establish live-site behavior under
customer CSP, consent managers, CDN caches, real authentication, or other browsers.
