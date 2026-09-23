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
- Embed: 1 test passed.
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
