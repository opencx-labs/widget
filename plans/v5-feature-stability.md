# v5 Advanced and Web feature stability checklist

Inventory verified on 2026-09-28 against backend/dashboard main
`2d9f344bf578daf426cacc9e2352996ffd2ce025` through GitHub CLI and widget
candidate `0608a49d3ae04d6150b213237b6905192e2f3a85` (PR #84).
This is a verification checklist, not a stable-release approval.

The dashboard inventory comes from `feature-copy.ts` and
`WidgetDeliverySettings.tsx`. There are seven Advanced controls and nine Web
controls. Advanced controls also affect backend behavior outside the widget.

## Acceptance for every control

- Save through the actual settings API, reload, and verify persistence and org
  isolation; exercise read-only roles, denied entitlements, failed saves and
  consecutive updates. A preview or optimistic switch alone is insufficient.
- Verify the enabled behavior and the disabled behavior with the same seeded
  data, including omitted embed options and unsupported clients. Embed overrides
  must not enable features denied by the server.
- Follow the setting through backend execution, the emitted payload and rendered
  widget. Hiding something in CSS is not a privacy boundary.
- Cover interruption, reload/reconnect, retries, cancellation and identity changes
  where applicable; no duplicate actions or permanent loading states.
- Exercise classic and Companion surfaces wherever supported, including desktop,
  mobile viewport, keyboard use and reduced motion for visible interactions.
- Record the exact tested revision, command, result and evidence boundary. A unit
  pass, mocked browser pass and real local backend pass are different evidence.
- A confirmed bug needs a reproducer, a fix in the owning layer and a regression
  check. Do not weaken assertions or add sleeps that conceal a race.

## Feature inventory

All entries remain **pending full verification**. Existing tests are inputs to
the audit, not automatic completion of an entry.

| ID  | Location | Control / key                                 | Specific acceptance checks                                                                                                                                                                                                                    |
| --- | -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Advanced | Progress updates / `preamble`                 | On/off at org and embed; updates before/during work; preserved final answer; distinguish updates from partial-text streaming.                                                                                                                 |
| A2  | Advanced | Remembers past sessions / `memory`            | Correct contact/account history, disable truly excludes historical context, no cross-contact/org recall.                                                                                                                                      |
| A3  | Advanced | Team in the loop / `keep_ai_with_team`        | Team request reaches Inbox; internal notes stay private; AI resumes appropriately; explicit human takeover prevents competing replies.                                                                                                        |
| A4  | Advanced | Scheduled follow-ups / `schedules`            | Right session and time, cancellation, restart/retry without duplicate runs, disabled feature removes scheduling authority. Use an isolated local queue.                                                                                       |
| A5  | Advanced | Task plans / `plan_mode`                      | Create/update/complete, ordering, stop/reconnect/history and disabled state.                                                                                                                                                                  |
| A6  | Advanced | Workspace / `sandbox`                         | Entitlement/disable enforcement, org/session isolation, execution errors, artifact delivery and cleanup.                                                                                                                                      |
| A7  | Advanced | Builds mini apps / `mini_apps`                | Build and render, action authorization, isolation, failed builds and disabled feature. Any publishing exercise must use an isolated local test target.                                                                                        |
| W1  | Web      | Stream replies / `presentation.streaming`     | Partial vs complete replies, opt-in transport, stop, reconnect/replay, follow-up queue, history and human replies.                                                                                                                            |
| W2  | Web      | Tool activity / `presentation.toolActivity`   | Hidden/status/details in live output and history; hidden arguments/results excluded from browser payloads; display changes cannot reveal prohibited details.                                                                                  |
| W3  | Web      | Show reasoning / `presentation.reasoning`     | Independent of tool display and text streaming; off removes protected reasoning from live/history payloads and cached UI.                                                                                                                     |
| W4  | Web      | Voice dictation / `dictation`                 | Real local session setup plus transcription-provider boundary, partial/final text, denial, failure, stop/close, microphone cleanup and org opt-out.                                                                                           |
| W5  | Web      | Rich replies / `inline_ui`                    | Supported cards/tables/charts, incremental rendering, history, malformed content, sanitization and unsupported-client fallback. General-purpose forms are not in this renderer's catalog; MCP elicitation has a separate form implementation. |
| W6  | Web      | Sees the page / `page_context`                | Explicit embed opt-in, exclusions for sensitive controls, navigation freshness, selected marks, disabled payload with positive control.                                                                                                       |
| W7  | Web      | Points at the page / `client_tools`           | Correct control reference, stale/removed elements, highlight cleanup, no clicking/typing authority implied by pointing alone.                                                                                                                 |
| W8  | Web      | Acts on the page / `page_actions`             | Separate action authority, safe default, visitor consent for committing actions, decline, revocation during consent, truthful result and no duplicate execution.                                                                              |
| W9  | Web      | Selectable questions / `clarifying_questions` | Renderer capability, answer/skip, exactly one continuation, repeated question handling, history and text fallback.                                                                                                                            |

Authentication renewal, personal connections, attachment handling and Companion
layout/lifecycle are cross-feature checks; they are not extra switches on these
two settings pages. Repeat their relevant checks with the affected feature on.

## Execution order

1. Shared permissions, feature defaults and embed narrowing; prioritize
   W6/W7/W8 because they read or change the host page.
2. W1/W2/W3 plus A1/A5: transport, display and progress together.
3. W5/W9/W4: rich UI, questions and dictation.
4. A2/A3: memory and team collaboration boundaries.
5. A4/A6/A7: scheduling, workspace and mini apps with isolated infrastructure.
6. Cross-feature combinations, actual settings save/reload and local backend
   smoke on the final built widget. Keep previous v4 upgrade checks passing.

## Initial inspection and test evidence

- Current dashboard main has separate `client_tools` (point) and `page_actions`
  (click/type) switches. The widget candidate's config and send-feature mapping
  only expose `clientTools`; `AgentChatPageActions` also checks that combined flag.
  Trace the server gate and reproduce the independence contract before deciding
  the necessary fix. This inspection alone does not prove a production bypass.
- The shared backend checkout has unrelated changes and an older checked-out
  revision. Its local settings inventory omits `page_actions` and
  `keep_ai_with_team`; use the verified main revision for subsequent backend
  testing without replacing that checkout's work.
- On 2026-09-28, the widget candidate passed **68 focused tests in eight files**:
  41 core tests for feature mapping/narrowing, client presentation and engine
  selection; 27 headless tests for presentation, send-time narrowing and
  capabilities. These are local unit/component tests, not settings persistence
  or real backend end-to-end proof.

Commands (run from each named package directory using installed dependencies):

```sh
# packages/core
../../node_modules/.bin/vitest run src/__tests__/context/widget-ctx.features.spec.ts src/__tests__/context/message-ctx.send-features.spec.ts src/__tests__/context/resolve-client-presentation.spec.ts src/__tests__/context/streaming-engine.spec.ts

# packages/react-headless
../../node_modules/.bin/vitest run src/agent-chat/__tests__/apply-presentation.spec.ts src/agent-chat/__tests__/use-agent-chat.feature-narrowing.spec.tsx src/agent-chat/__tests__/use-agent-chat.send-features.spec.tsx src/__tests__/WidgetProvider.capabilities.spec.tsx
```

No feature is marked fully verified by this initial inventory pass.

## Focused pass: W5–W8 (2026-09-28)

These changes are on PR #84's compatibility branch, based on `0608a49`.
The scope below is the widget implementation. It is not a backend deployment,
settings-persistence test or stable-release approval.

### Reproduced defects and fixes

- **Rich replies:** a null streamed element threw during normalization outside
  the error boundary. Normalization now runs inside it; surrounding text remains
  visible, and the next valid revision recovers. Real SSE cards/tables also render
  after completion and after loading the stored conversation.
- **Pointing and actions:** the widget previously had a combined `clientTools`
  permission although current backend main has a separate `page_actions` gate.
  `features.pageActions` now requires explicit embed opt-in plus backend support,
  `pageContext` and `clientTools`. Missing support is denied. Both send engines
  send an explicit false by default. This is an intentional beta migration:
  existing action integrations must add `pageActions: true`; v4 defaults remain off.
- **Cancellation:** delayed effects no longer draw/click after stop, replacement,
  unmount or permission revocation. Stop withdraws effects before the SDK status
  changes. Completed tool parts do not execute again. Replaced/unmounted consent
  promises resolve as declined instead of remaining pending invisibly.
- **Stale targets:** reference prefixes wrapped after 1,000 snapshots and could
  resolve an expired reference to a different control. Prefixes now increase
  without wrapping. Targets are checked again after cursor travel; a newly
  committing or renamed committing control cannot reuse the previous consent.
- **Truthful results:** a controlled dropdown that reverted a selection was
  incorrectly reported as successful. Readback now compares the selected value.
  An empty post-action snapshot is sent to clear the server's previous controls.
- **Privacy:** host exception text could be forwarded in the page-action result.
  A synthetic private error reproduced this path; replies now use generic text.
  This demonstrates a possible leak path, not evidence of a production incident.
- **Companion:** its own approved page click triggered outside-click dismissal,
  hiding the conversation. Widget-generated pointer events now retain the chat;
  real visitor outside clicks still dismiss it. The production embed test failed
  before this fix and passes afterward.

### Verification

- Core: **379 tests**; headless: **257 tests**; React: **598 tests**.
- **91 browser source tests per engine** cover page context/privacy, correct/stale/covered targets,
  controls, action readback, consent and rich-reply rendering in Chromium,
  Firefox and WebKit. The additional host-error privacy case has its own failing
  reproduction before the fix.
- `packages/embed/e2e/page-features.e2e.mjs`: **12 scenarios per browser**,
  exercised against the production bundle through an actual local SSE connection.
  Both popover and Companion cover rich cards/table/history, unsafe links and HTML,
  context opt-out and positive opt-in, sensitive-field exclusions, pointing with
  actions disabled, and allowing/declining a committing action exactly once.
- Existing public integration/release-readiness tests plus the published v4.0.63
  upgrade matrix: **40 Chromium cases passed**, including same-owner token renewal
  and another-contact reset. The earlier three-browser upgrade evidence remains
  separate from this pass.
- Test servers and browser routing reject unexpected external requests. Every
  account, token, page value and response is synthetic; no customer site is changed
  and no provider API key is required.

Commands:

```sh
# From packages/react; run once for each engine.
WIDGET_TEST_BROWSER=chromium ../../node_modules/.bin/vitest run --config vitest.browser.config.ts

# From packages/embed, after building core -> headless -> React -> embed.
WIDGET_TEST_BROWSER=chromium node --test e2e/page-features.e2e.mjs
node --test e2e/public-setups.e2e.mjs e2e/release-readiness.e2e.mjs e2e/v4-upgrade.upgrade.mjs
```

### Remaining acceptance work

1. **Consent policy:** existing selective consent uses English committing words
   and form markup; it cannot guarantee detection of non-English committing
   controls or fields that auto-save. The current behavior is preserved pending
   the product choice between confirming every action and accepting that limit.
   Do not claim all consequential actions are confirmed under the existing policy.
2. **Business outcomes:** a click result observes a browser-side change. It cannot
   prove a remote payment, deletion or other business transaction succeeded.
3. **Backend integration:** settings save/reload, entitlements, identity isolation
   and activity/history filtering are verified below against the local backend.
   Feature-specific provider and business-outcome checks remain separate.
4. **Forms:** generic rich-reply forms are not implemented. Do not mark them passed
   based on cards/tables or conflate them with separately implemented elicitation.

## Identity and settings verification (2026-09-28)

Widget production source: `7e659981fe91fa166ccadded49cb74328623c0b0`.
Local backend: `6b1db20f760272a34f64d1299bf5c92e1dcda8c0`.
Embed SHA-256: `f3d3e9841ec12cf9d6de004c570b7575622f1ec5ca0274b4796af5aeab2169d5`.

- Strengthened the published-v4 upgrade fixture: JWT owner determines persistent
  session/history storage. Switching users no longer erases the prior user's
  data. The test checks A → B → A, distinct session IDs, the renewed bearer token,
  retained A history and an explicit cross-owner rejection. All 25 Chromium
  upgrade scenarios passed; the strengthened identity case also passed Firefox
  and WebKit.
- Added opt-in real HTTP verification in `packages/embed/e2e/local-backend/`.
  All 13 Advanced/Web boolean switches passed off/on save, fresh GET, effective
  runtime and independent-org assertions. All nine denied entitlements rejected
  mixed writes without saving the free field. Read-only and foreign-org writes,
  invalid values, and concurrent independent patches were checked.
- All twelve streaming/tool-activity/reasoning combinations persisted and reached
  the widget's actual `/config` response. Invalid updates preserved saved state.
- The real-backend browser journey also passed in **Chromium, Firefox and WebKit**:
  create the session with published v4, load v5 with the same config/storage,
  renew the token, switch A → B → A and reload. Both histories stay in the database;
  each identity sees only its own. AI replies are disabled in these fixture orgs;
  authentication, session writes and history reads use the actual backend.
- Real signed JWT checks verified same-contact renewal, expired-token rejection,
  and cross-contact/org rejection for history, polling, v5 messages and stop.
  Existing owner history remained readable throughout as the positive control.
- Backend's five focused settings suites passed **36 tests**. Two additional
  backend suites passed **3 tests**, covering cross-contact access to a live turn,
  authorized owner stop, live/history tool-detail filtering and selectable
  questions. These use real routes/database with a controlled model fixture.
- Widget focused core/headless auth and feature suites passed **86 tests**.

The new local checks use synthetic orgs and the isolated Payla database. They
verify settings and identity boundaries; feature-specific provider behavior
(dictation, sandbox, scheduling, mini apps) still needs its own acceptance.
The selective page-action consent limitation above remains. No package release
or production deployment is part of this verification.
