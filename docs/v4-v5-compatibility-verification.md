# v4-to-v5 compatibility patch: local verification

Browser verification used the beta.10 source on 2026-09-23. The patch was then rebased onto main (125d501), excluding the separate beta.10 version/changelog commit, and all builds, type checks, lint and 1,178 tests passed again. This v5 patch has not been published or deployed.

## Changes

- The embed ships one self-contained `script.js` again. It does not request `widget.js` or JavaScript chunks. React consumers retain their normal application bundling options.
- An unchanged integration uses classic send/poll delivery. Streaming requires `streaming: true` and backend support.
- Personal connection UI and requests require `capabilities.connections: true`; classic requests explicitly advertise connections as disabled by default.
- `WidgetUserMessage.deliveredAt` is restored as a deprecated alias of `timestamp` for v4 custom renderers.
- Configured footers retain safe inline presentation styles. Agent HTML remains sanitized. Arbitrary scripts, event handlers, resource-loading CSS and positioning styles are not restored.
- Token renewal understands the backend JWT envelope (`sub.type: widget-contact`, `sub.payload`). Renewing the same contact/account updates Authorization without destroying the conversation. Different identities still reset state.

Existing beta integrations using streaming/connections must set the explicit options above. The Payla playground is updated accordingly.

## Automated checks

- Core: 370 tests passed.
- React headless: 249 tests passed, including the actual backend token envelope. The renewal regression failed before the fix and passed after it.
- React UI: 558 tests passed.
- Embed: 3 tests passed after the repeated-script-load fix. Both new regression tests failed before the fix and passed afterward. Embed type check, lint and production build were rerun successfully.
- All four package type checks and lint passed. Lint has an existing unused-variable warning in cursor.browser.spec.ts.
- Production builds and production JSX validation passed for all four packages.
- Payla widget synchronization: 3 tests passed.
- `git diff --check` passed.

## Browser checks

The first browser check served only the built script.js with a controlled authenticated API. With an unchanged configuration, the widget sent a message and displayed the reply using v2 requests, despite the API advertising streaming support. No connection requests were made. Footer text computed to red.

The second check used the real local PostgreSQL full-seed Payla organization and real backend widget routes, not mocked authentication or chat responses. The host obtained visitor tokens server-side through `/widget/authenticate-user` using a temporary widget-only API key.

| Check                | Observed result                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Real authentication  | Sign-in succeeded; config and sessions returned 200                                                               |
| Default delivery     | v2 session creation/send returned 201; polling returned 200 and displayed `COMPAT_OK`                             |
| History              | Reloaded page, opened saved conversation, restored original question and reply                                    |
| Token renewal        | Active session and open transcript remained intact; subsequent polling used a different Authorization fingerprint |
| Send after renewal   | v2 send returned 201 and displayed `RENEWAL_OK` in the same session                                               |
| Explicit streaming   | v5 stream returned 200 and displayed `STREAM_OK`                                                                  |
| Explicit connections | Elicitation requests began only after opt-in and returned 200                                                     |

The test backend initially started existing local background jobs. It was stopped and restarted with background workers disabled for the checks above. Six existing local jobs had failed during that first startup; these are not widget test failures and were not retried or deleted.

## Limits

This establishes the paths above, not universal compatibility for every customer integration. It does not test real third-party OAuth authorization, uploads, voice, every custom React component, every browser/CSP combination, or production infrastructure. Zod 4 and stricter HTML sanitization remain v5 changes. The self-contained embed is approximately 2.21 MB raw / 657 KB gzip, trading a larger initial script for the v4 single-file contract.

Package versions and npm dist-tags are unchanged. This is a local patch, not a stable v5 release approval.

## Page privacy follow-up (2026-09-24)

The earlier compatibility checks were not a privacy clearance. The follow-up
reproduced private descendant text, private referenced labels, editable values,
and hidden descendant text entering page context. It also reproduced private
mark targets and capture/upload paths that did not enforce private regions.
Synthetic markers were used; these checks do not establish a past customer leak.

Fixed:

- Page reading requires `features.pageContext: true`. Actions additionally require
  `features.clientTools: true` and organization support for both. Omitted flags
  explicitly send false to both message transports. Normal and Companion modes
  share this boundary.
- Collected text excludes private/hidden regions, referenced private labels, and
  field/editable values. Direct private/field marking is rejected.
- Captures containing private/hidden content, fields or opaque embedded media are
  omitted. Safe previews stay local until Send; upload rechecks region privacy.
- Collected page URLs strip credentials, query parameters and fragments.
- Pending agent actions recheck access after consent/cursor travel, and page
  replies do not forward control snapshots after page access is disabled.

Validation on the privacy patch:

| Gate                                                           | Result                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Core tests                                                     | 373 passed                                                                                    |
| React headless tests                                           | 249 passed                                                                                    |
| React tests                                                    | 568 passed                                                                                    |
| Embed tests                                                    | 3 passed                                                                                      |
| Chromium privacy and existing page-reader tests                | 21 passed                                                                                     |
| Type checks, lint, production builds and production JSX guards | All four packages passed; pre-existing cursor.browser.spec.ts unused-variable warning remains |

Reproduce package gates with `pnpm -r test`, `pnpm -r type-check`, `pnpm -r lint`,
and `pnpm build`. For browser checks, install Chromium with `pnpm exec playwright
install chromium --only-shell`, then run:

```sh
pnpm --filter @opencx/widget-react exec vitest run --config vitest.browser.config.ts src/page-controls/__tests__/privacy.browser.spec.ts src/page-controls/__tests__/read-controls.browser.spec.ts
```

Browser tests use real Chromium DOM/layout and safe JPEG capture. Upload transport
is stubbed; no live customer account or backend was used for this privacy pass.
Host-supplied context/custom data, deliberately attached files and typed messages
remain explicit inputs. Visible unmarked business data and URL paths are not
secret-detected. These fixes do not constitute an exhaustive security audit or
approval to promote v5 to latest. No packages were published.

## v4 feature parity follow-up (2026-09-26)

Ported the source changes from release/v4 at `0b280d7` (PRs #82 and #83):
`requireInitialQuestion`, the shared requirement hook, conditional composer,
and `pb-4` question-container padding. No v4 version numbers or release tags
were copied. Companion quick-ask also respects the requirement, since it mounts
a composer separately from the standard footer.

Companion additionally presents optional starter questions as floating pills above
its quick-ask bar, using the existing `initialQuestions` and
`requireInitialQuestion` options. Required mode hides the input; optional mode
leaves it editable. No greeting panel is inserted behind the pills. Standard
popover/inline question placement remains unchanged.

Production-bundle Chromium checks at 1280×900 and 390×844 confirmed three visible
starter pills, an editable optional-mode input, no required-mode input, no
horizontal question overflow on mobile, and selection opening the conversation.
The preview used a local mock backend; it was not a real-agent test.

The updated React suite passed all 581 tests, including both question placements,
required/optional/empty configuration, follow-ups, reset, failed-first-send
rollback, padding, and Companion quick-ask. React type check and lint passed
(with the existing cursor test warning). All four production builds and JSX
guards passed; React/embed were rebuilt after the floating-layout update.
