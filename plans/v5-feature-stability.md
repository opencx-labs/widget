# v5 Advanced and Web feature stability checklist

Inventory verified on 2026-09-28 against backend/dashboard main
`2d9f344bf578daf426cacc9e2352996ffd2ce025` through GitHub CLI and widget
candidate `0608a49d3ae04d6150b213237b6905192e2f3a85` (PR #84).
This is a verification checklist, not a stable-release approval.

## Current release scope (2026-09-29)

The user excluded the optional file workspace from this work. Backend PR #3264
is closed without merging. PR #84 removes its authenticated report downloader,
download capability, generated endpoint, renderer integration and dedicated
tests. Existing v4 compatibility, authentication, page permissions and ordinary
attachments remain in scope. Workspace implementation, database migrations and
backend PR #3264 are not release requirements for this widget change.

Earlier dated entries below describe the broader audit at that time; their
workspace findings are not current release gates. No claim is made that the
excluded feature is complete or safe to enable.

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

Use the dated evidence below for completed checks and remaining boundaries.
Settings coverage does not establish full runtime behavior for every feature.

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
| W8  | Web      | Acts on the page / `page_actions`             | Separate action authority, safe default, visitor consent for every action, decline, revocation during consent, truthful result and no duplicate execution.                                                                                    |
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

1. **Consent policy:** closed by the follow-up below: every action requires
   confirmation, including non-English controls and fields that auto-save.
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
The selective page-action consent limitation was fixed in the follow-up below.
No package release or production deployment is part of this verification.

## Release follow-up: explicit page consent (2026-09-28)

- Removed label/form classification. The styled widget asks before each click,
  fill, selection, check and uncheck, including navigation. Pointing is unchanged.
  Proposed fill/select values are displayed as escaped text before approval.
  Decline causes no host events; each later call needs its own approval. Permission,
  cancellation and target-name checks still run after pointer travel.
- The actual adapter regression reproduced seven missing-confirmation cases before
  the fix. Old classifier cases were moved to the actual adapter seam, with
  additional Arabic and auto-save controls. All **42 focused tests** pass.
- **32 production-bundle scenarios per browser** passed across Chromium, Firefox
  and WebKit: 28 in the initial run and four Arabic cases rerun after correcting
  the fixture's missing UTF-8 response charset. Both surfaces test pending,
  declined and approved host effects for every action type, with one page reply.
- React **618**, headless **257**, embed **3** unit/component tests passed.
  All four package builds, production JSX guards, type checks and changed-file
  lint passed. These source/browser checks use synthetic data and SSE responses.
- Rebuilt embed SHA-256:
  `43023ce79494b6d3c35fc7033d220b8ecb69adf7d9ef34421d340cb81ad8f81e`.
  This exact bundle passed the real local v4 → v5 token-renewal and A → B → A
  history journey in Chromium, Firefox and WebKit. The 18 real HTTP settings
  and authentication check groups were rerun successfully with fresh identities.
- Fixed Greptile's credential-file finding: the local verifier now atomically
  replaces identity files with private permissions, without following existing
  symlinks. Four filesystem regressions pass, including failure preservation.
- Real local backend **27 tests** passed across dictation minting, native task
  plan updates, feature-gated tools and scheduling create/list/cancel. The real
  provider returned a short-lived dictation secret; this is not a completed
  speech-to-text session. Scheduler tests used the dedicated local Redis queue
  without consuming scheduled jobs; execution/retry checks are separate.

- Another **78 backend tests** passed: mini-app source/version persistence,
  draft/active isolation, atomic publish transitions in the local database,
  permission/scoped RPC and cross-org rejection, plus scheduler final-fire
  failure/retry handling. Storage used local MinIO and synthetic orgs. The
  scheduling suite controls trigger delivery; it does not prove a worker restart
  through the full agent. Mini-app service tests do not prove browser rendering
  or agent authoring from a prompt.

Remaining: finish the provider/workspace and full workflow checks, run final
current-head review/CI, and obtain the repository's required approval. Nothing
has been published or deployed.

## Runtime acceptance follow-up (2026-09-28)

### Microphone shutdown

- Actual provider transcription exposed a classic popover bug: closing it left
  the capture track live and its peer connection connected. The content stays
  mounted for history and animation, so unmount cleanup never ran. Companion
  already stopped correctly. Closing the popover now explicitly stops dictation.
- A deterministic production-bundle test reproduced the failure while the mint
  request was pending. After the fix it passes in Chromium, Firefox and WebKit;
  a late mint cannot resume capture, and typing still works after reopening.
- Chromium's complete public setup/release-readiness run passed **16 cases**,
  including the existing close-frame assertions. React type-check/lint and both
  rebuilt React/embed production guards passed; all **618 React tests** passed.
  No animation settings changed.
- The opt-in real-provider check uses synthetic speech instead of any physical
  microphone. Classic and Companion both passed in Chromium and Firefox:
  actual streamed transcription, typed-prefix retention, no automatic chat send,
  Stop cleanup, restart and close cleanup. WebKit's initial provider connections
  timed out on both surfaces; a diagnostic classic rerun passed without changing
  transport code, but the following two-surface rerun reproduced both timeouts.
  Diagnostics show a successful HTTP handshake and accepted remote description
  without ICE progressing beyond `new`, followed by watchdog cleanup. This is
  not an unconditional Safari pass; the capture harness versus browser/network
  cause remains to be isolated. All timed-out capture tracks were stopped.
- Embed SHA-256:
  `eeb0560254a883f702312f04c3d8127d1402f88d14a5c7d280abfa41d7d0b105`.

### Scheduled follow-ups

- **Five** real local BullMQ worker/Redis tests passed: one-shot and unlimited
  schedules, boot rescheduling, persisted remaining-fire counts and already-spent
  schedules. These tests control downstream workflow execution.
- **Two** real workflow/agent checks passed: one-shot delivery and repeating
  delivery, recorded limits and no further reply after completion. They invoke
  the cron processor directly; worker-clock coverage is the separate suite above.
  The repeating case initially needed one retry; a subsequent explicit
  `--retry 0` run passed. These are local synthetic sessions, not customer runs.

### Confirmed advanced-feature gap

- An actual widget SSE route test enabled and entitled `sandbox`, `mini_apps`
  and `plan_mode`, then inspected the tools passed to the controlled responder.
  `update_plan` was present as a positive control; `mini_app_create` was absent.
  Passing mini-app service/storage tests therefore does not prove agent authoring.
- In backend `6b1db20f760272a34f64d1299bf5c92e1dcda8c0`, the current
  `companion/agent-tools/build.ts` does not wire workspace or mini-app tools into
  the widget responder. Comparing main at
  `885d7aee9b71bceb0a51d21c8e2316eedfe8c1b5` found no subsequent changes to
  that runtime wiring. The missing tool was reproduced locally, not against a
  customer session. Restore and verify this feature before claiming all Advanced
  features are ready.

**Release status: not ready for the full feature promise.** Resolve the backend
capability gap and intermittent WebKit dictation result, complete remaining
acceptance, and obtain current-head review/required approval. No publication or
deployment was performed.

## Dropdown approval review follow-up (2026-09-28)

- Reproduced Greptile's finding: confirmation showed opaque values such as
  `plan_42`, and a changed label could still be selected after approval. Six
  actual-adapter regressions failed before the fix.
- Resolve the concrete option before asking; show its escaped visible label.
  After pointer travel, reject a changed value/label, replaced/removed option or
  newly disabled option. Consent and execution share resolution; duplicate
  labels/values and disabled option groups cannot result in an arbitrary choice.
- **625 React** and **257 headless** tests passed, plus builds, production guards,
  type checks and changed-file lint. **18 native page-action cases per browser**
  passed in Chromium, Firefox and WebKit, with positive controls after removing
  disabled/ambiguous conditions.
- **Six production-bundle dropdown cases per browser** passed over local SSE:
  readable opaque-ID choices, pending/declined/approved effects, and refusing a
  price-label change while permission is pending, in both widget surfaces.
- Latest embed SHA-256:
  `52e91fe87c50fcd1d7f94fa3090059d78917115b0c489c18f092fe0187a5cef9`.
  The backend capability and WebKit provider-connection gaps above remain open.

## Latest review and acceptance follow-up (2026-09-28)

### Dropdown ambiguity and private fixtures

- Reproduced the new review finding in Chromium: a request for `Pro` selected
  an option whose value was `Pro` but whose visible label was `Basic`, despite
  another option being labeled `Pro`. Both option orders failed the regression.
  Resolution now combines value and label matches and rejects conflicting
  options. An ambiguity introduced during consent also cancels the action.
- **36 adapter/consent tests** and **20 native action tests per browser** passed.
  The rebuilt production embed passed **eight dropdown/SSE cases per browser**
  in Chromium, Firefox and WebKit: allow, decline, changed choice and ambiguous
  request in both classic and Companion. React/embed type checks, production
  builds and guards, changed-file lint and syntax checks passed.
- Reproduced local test credentials appearing in the dictation page's HTTP
  response. Both dictation and identity fixtures now inject credentials only
  through the browser automation channel, with assertions that the served HTML
  contains none. The real local **v4 → v5 renewal and A → B → A history test**
  passed again in all three browsers after this change.

### WebKit dictation resolved

- The earlier WebKit failure was in the synthetic capture fixture. Replacing
  `getUserMedia` bypassed WebKit's native capture-permission path. Completing
  that path with Playwright's built-in mock microphone, then immediately
  stopping those tracks, allowed ICE negotiation and real transcription.
  No production transport change or timeout increase was needed.
- Two fresh WebKit runs passed on the previous bundle. The latest rebuilt
  bundle then passed **all six real-provider dictation cases**: classic and
  Companion in Chromium, Firefox and WebKit, with transcript deltas, typed-prefix
  retention, Stop/restart/close cleanup, no automatic send and no unexpected
  browser destinations. Native mock-device tracks also ended. These use
  synthetic speech; physical microphone/Safari hardware behavior is not covered.
- Latest tested embed SHA-256:
  `ef4c0f03b11f11c943f4385150acc478aef3d440fcaaf4d80341ded404bb91eb`.

### Memory and team-assistance checks

- **32 backend tests passed** across five focused files on the isolated local
  database and Redis. One pre-existing skipped vague-memory test remained
  skipped; no test was disabled for this run.
- Covered previous-session history scope, verification-state matching and
  configured limits; team requests through the actual responder; internal and
  public reply continuation; duplicate/coalesced replies; failure visibility;
  feature-off, closure and human takeover. Team model output is controlled;
  the worker handler runs directly, not through a real queue worker in this run.
- Commands: the five exact specs were
  `system-actions/memory/memory-tool.chat.spec.ts`,
  `chat/__tests__/chat.service.ask-team-tool.responder.spec.ts`,
  `chat/service/resolve-human-help-reply.spec.ts`,
  `chat/human-agent-chat-service/send-message.keep-ai-with-team.spec.ts` and
  `chat/human-help-worker/run.spec.ts`, under backend `src/`, with `--retry 0`.

**Release status: still not ready for the full feature promise.** The WebKit
fixture issue and latest dropdown/local-fixture review findings are resolved.
Backend workspace/mini-app authoring and its acceptance remain open, as do final
current-head review/CI and the repository's required approval. Existing mini-app
tools target internal dashboard apps; clarify the intended visitor/team audience
before granting those capabilities to widget sessions. Nothing was published or
deployed.

## Remaining widget review work after scope cleanup (2026-09-29)

The review of `5b09c35` reported these findings, which require reproduction and
resolution on the cleaned candidate:

- A streamed page-action call can go unanswered when page actions are disabled.
- Closing dictation can flush a pending spoken send command.
- Attached marks can retain descriptions after their source becomes private.
- Disabling page access can leave Send enabled for a mark-only draft.
- The action-consent changeset describes the older selective confirmation policy.

After resolving these findings, rerun the affected checks and obtain current-head
review/CI and required repository approval. The cleanup does not publish packages
or change versions/tags.

### Cleanup verification

- Package sources exactly match the pre-workspace candidate `71f324f`.
- All four production builds, production JSX guards and package type checks
  passed. Changed-source lint and `git diff --check` passed.
- Core authentication, stale-token retry, feature mapping and permission checks:
  **37 passed** across six files. React capabilities, sanitized text and rich
  rendering checks: **37 passed** across three files.
- The cleaned production embed passed **41 Chromium browser cases**: 25 published
  v4 upgrade cases, six public-site integration fixtures and ten release checks.
  Includes unchanged desktop/mobile configs, token renewal and identity changes,
  duplicate script loading, authenticated uploads, open/close and normal motion.
  All browser network traffic is mocked locally; this run does not claim a new
  real-backend or physical-microphone check.
- The rebuilt embed SHA-256 is
  `ef4c0f03b11f11c943f4385150acc478aef3d440fcaaf4d80341ded404bb91eb`,
  identical to the recorded pre-workspace build.

Browser command, from `packages/embed`:

```sh
WIDGET_TEST_BROWSER=chromium node --test e2e/public-setups.e2e.mjs e2e/release-readiness.e2e.mjs e2e/v4-upgrade.upgrade.mjs
```
