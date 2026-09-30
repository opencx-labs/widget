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

## Widget review findings after scope cleanup (2026-09-29)

The review of `5b09c35` reported the following findings. They are addressed by
the follow-up below; current-head review is still required:

- A streamed page-action call can go unanswered when page actions are disabled.
- Closing dictation can flush a pending spoken send command.
- Attached marks can retain descriptions after their source becomes private.
- Disabling page access can leave Send enabled for a mark-only draft.
- The action-consent changeset describes the older selective confirmation policy.

Obtain current-head review/CI and required repository approval before merging.
The cleanup does not publish packages or change versions/tags.

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

### Review fixes and verification (2026-09-29)

All five findings above have fixes and local verification:

- Permission revocation answers unclaimed page calls with `declined` and cancels
  pending consent. An adapter already handling a call supplies its actual
  outcome, so revoking access after a click cannot falsely report it as declined.
  Replies are deduplicated and cannot include controls after page access ends.
- Close, unmount and disposal stop dictation without executing a pending spoken
  send command. Explicit Send flushes the final text once, and acceptance clears
  that exact draft while preserving subsequent edits.
- Marks retain local references to every original DOM node. Both serialized
  representations are rebuilt from those nodes at Send, including after snapshot
  preparation. Private, removed, replaced, editable and shadow-tree sources are
  rejected; new private descendants are filtered and stale snapshots omitted.
  Late upload completion cannot restore an unsafe URL. Validated payloads are
  independent of later mutations; safe local previews and empty-region notes
  remain supported.
- Revoking page access detaches marks and disables mark-only Send. If access
  changes during snapshot preparation, discarded notes cannot become message
  text. Deliberately typed text and configured v4 context remain supported.
- The action changeset now states that every page action requires consent.

Verification: **124 focused tests** (17 core, 20 headless, 87 React), **36
production release cases** (12 per engine), **21 native browser privacy cases**
(7 per engine), **25 unchanged-v4 upgrade cases** and **6 customer-style fixtures**
in Chromium all passed. Engines: Chromium, Firefox and WebKit. All four package
builds, JSX guards and type checks passed; changed-source lint and diff checks
passed. The built embed SHA-256 is
`f3dc57058426f79854734846876c3edc9d207febdf3390bc73d7bc488361396c`.

The new regressions reproduced failures before their fixes. Independent candidate
review also reproduced a private shadow-root move and identified draft-clear and
already-executed-action races; those cases are covered by the final tests.
Browser traffic, media devices and transcription are synthetic. The browser
cases establish widget behavior, not a new real-backend or microphone-hardware
acceptance run. Current-head external review/CI and required approval remain.
Workspace stays excluded; nothing was merged, deployed or published.

### PR #85 follow-up: prepared sends and action targets (2026-09-29)

Greptile's 1/5 review of `81176dd` identified a real deferred-send ownership
bug and stale action approval. This follow-up:

- Captures the conversation generation before snapshot preparation. Reset,
  disposal and reusing an empty Companion tab for history invalidate that work.
  Stale callbacks neither send nor clear another chat's draft, marks or files.
  Session creation is fenced too. Same-owner renewal and normal composer
  unmounts preserve valid sends.
- Rechecks native action meaning after consent, after pointer travel and before
  each dispatched pointer event. This includes resolved link destinations,
  targets/download metadata, associated forms, submitter overrides and values,
  native ancestors and label-forwarded controls. Changed operations are declined.
- Documents the required `pageActions` embed opt-in and false page-feature
  defaults. Page-text traversal now checks each ancestor style once per read,
  while still reading privacy changes fresh on the next call.

**Action contract:** approval authorizes the named control/action/value, followed
by normal website event handling. It is not a sandbox or a transaction lock over
the customer's JavaScript. A click handler can intentionally redirect, save data
or submit a form after execution begins, just as with a visitor click. Local
reproduction confirmed this behavior, including a handler changing its own link
destination. The pre-execution checks do not promise to freeze the destination
through host handlers. No handler interception, native-action replay, customer
callback registry or browser-specific navigation interception was introduced.
`done` remains evidence of browser-side change, not proof that a remote business
transaction succeeded. A stricter operation contract would require a separately
designed integration rather than silently changing normal click behavior.

Verification: 163 focused tests (28 core, 31 headless, 104 React), 111 native
browser cases (37 each in Chromium, Firefox and WebKit), 12 production embed
cases and 25 unchanged-v4 upgrade cases in Chromium passed. The latter includes
same-owner renewal and identity change. All four production builds, JSX guards
and package type checks passed; changed-source lint and diff checks passed.
Ownership, changed native operations and repeated style reads reproduced before
their fixes. All traffic remained local/mocked. These checks do not replace
current-head Greptile/CI, repository approval or a final-build real-backend smoke.

### Multi-step page freshness and loading follow-up (2026-09-29)

A delayed three-screen fixture reproduced early completion: a screen explicitly
marked `aria-busy="true"` was returned after about 100 ms, before the next control
arrived. Observation now waits for public busy regions to finish, bounded at
three seconds. Hidden, private and widget-owned busy regions do not delay it.
Turn/permission revocation ends observation, and recovery does not replay the
already-dispatched action. A loading timeout reports uncertainty explicitly.

Stale references now return a fresh, privacy-filtered control snapshot without
clicking a replacement. Other recoverable outcomes also return current controls;
declines, unsupported actions and revoked permissions do not add page data.

The coordinated backend patch replaces the previous snapshot, including an empty
screen, rejects a selection resolved against a replaced snapshot, and gives
visitor approval up to two minutes instead of eight seconds. Its prompts distinguish
browser changes from remote operation success and forbid automatic retry after
an uncertain outcome. Published migration, feature-reference and Companion guide
sources now explain the explicit page-action opt-in for the stable candidate.

Verified locally: **123 native cases** (41 each Chromium/Firefox/WebKit), **58
React cases**, **7 backend protocol/timing regressions**, and **12 production
embed cases** in Chromium. All four widget production builds and JSX guards pass;
React typecheck and changed-file lint/diff checks pass. Docs frontmatter and all
three rendered local guide pages pass. The three-screen fixture has 700 ms loading
per step and asserts exactly one click per step. These are deterministic local
fixtures; no live customer or final-build real-backend acceptance is implied.
Backend full typecheck has the same 22 dependency diagnostics with the main-branch
source and the candidate; changed backend files have no type diagnostics.

Embed SHA-256:
`faa7867fd0222c2d5540482b16de3979ac912f8a2cc1f0fe4313589e7aca8c98`.

The snapshot remains a bounded control list. A host that loads silently without
an `aria-busy` signal can settle too early, loads beyond three seconds can remain
incomplete, and full reloads can interrupt the turn. Such cases require a fresh
message or visitor verification, not a blind action retry. No measured production
failure percentage is available. Current-head independent review, required CI /
approval, and coordinated real-backend acceptance remain release gates.

### Greptile 4/5 follow-up: dispatched outcomes and stable controls (2026-09-29)

Greptile reviewed `648c797` at 4/5 with three actionable findings. Local
regressions reproduced all three before these fixes:

- Pointer sequences distinguish an action that never started from one stopped
  after host events ran. Interrupted actions still stop immediately, but retain
  observation and report the observed change or an unknown result, never a false
  decline. The reply forbids automatic retry. Focus-triggered host effects receive
  the same treatment; permission revocation still suppresses page snapshots.
  Observation is cleaned up in a `finally` block.
- Already-busy unrelated regions, including their ongoing mutations, do not hold
  up an action. Busy ancestors, descendants and `aria-controls` regions still
  count, as do newly busy regions. This is bounded browser observation, not a
  general guarantee that the host application or remote transaction completed.
- Continuously observed DOM controls keep their references across snapshots.
  Absent controls still expire after two readings; expired references never
  revive, and replacement nodes receive different references.

Verification on this candidate: **225 native browser cases** (75 each in
Chromium, Firefox and WebKit), **61 React tests**, and **12 production embed
cases** in Chromium passed. All four production builds and JSX guards, React
typecheck, changed-source lint and diff checks passed. Tests cover interrupted
pointerdown/mouseup/focus, check/uncheck, permission revocation, related versus
background loading, and three consecutive actions against the original refs.
All browser traffic remains local/mocked; this is not real-backend acceptance.

Embed SHA-256:
`058e1a6b58629a70a73b44d73acf8c1bd9d16c688b676135c54eb7d1da170fe2`.

The coordinated backend draft remains PR #3277. Fresh review of this widget
candidate, required CI/approval and coordinated final-build real-backend
acceptance remain release gates. No versions, npm tags or deployments changed.

### Greptile 4/5 follow-up: recycled controls and uncertain results (2026-09-29)

The review of `b2df1ee` found three additional cases. Seven browser regressions
reproduced the reported behaviors before these fixes:

- Reference renewal now binds to the observed control name, native operation,
  URL and surrounding item context. Changes invalidate old handles before a
  fresh snapshot or action; returning A to B to A cannot revive a handle.
  Consent rechecks the reference too. Explicit row/item boundaries isolate
  unrelated rows; otherwise context checks are conservative, including the body
  when no boundary exists. Widget overlays and presentation mutations do not
  invalidate references. Native targets remain weakly held.
- An already-loading region newly linked by a host handler is included in
  observation. Unrelated background loading remains excluded.
- Every interrupted sequence returns `no_change` with explicit uncertainty and
  no automatic retry. A hover/focus/press effect cannot count as completion of
  the requested click. Observed page movement is stated in the detail; no effect
  is assumed absent either. This supersedes the interrupted `done` result in the
  preceding follow-up without changing the wire outcome enum.

The coordinated backend PR #3277 now preserves that uncertainty in tool results
and system guidance. It also rejects snapshots from superseded action replies,
including when a newer action times out, and clarifies that earlier beta embeds
still need explicit false flags to disable page access before upgrading.

Verified: **363 native browser cases** (121 each Chromium/Firefox/WebKit),
**67 React cases**, **12 production embed cases** in Chromium, and **12 backend
protocol/prompt cases**. All four widget builds/JSX guards, React typecheck,
changed-file lint and diff checks pass. The three affected guide pages render
locally and pass frontmatter lint. Backend typecheck retains the same 22
dependency diagnostics as the previously checked main-branch source.

Embed SHA-256:
`f93863642d3ea407d2fe507a1ab055ea39ded42430999caee0b369fb84707aef`.

The checks use local fixtures. DOM checks cannot detect application state
changes with no corresponding DOM or URL change; normal host handlers are not
sandboxed. Fresh independent reviews, required CI/approval and coordinated
final-build real-backend acceptance remain. Nothing was published or deployed.

### Greptile 4/5 follow-up: local identity and idle observation (2026-09-29)

The review of `2f0ee36` found approved clicks interrupted by unrelated content or
hover tooltips, plus repeated reference scans after every idle page update.
Five browser regressions failed before the fix. With 300 retained controls and
five unrelated updates, the old observer performed 3,000 weak-reference lookups.

- References now bind to the control, its local parent and containing semantic
  records/regions. There is no whole-body fallback for top-level controls.
  Mutations in separate regions or sibling records do not invalidate them.
  Section-wrapped record labels and outer record identity remain dependencies.
- Tooltip insertion and changes stay outside the containing record's identity.
  Removal/reparenting still invalidates a tracked control, including moving into
  an ignored tooltip and back. Names, native operations, URLs and consent checks
  remain enforced. Live regions do not bypass identity checks.
- The observer advances weakly indexed revision counters along the changed
  node's path. It never enumerates retained controls, dereferences their nodes,
  reads their content, or retains a mutation queue while idle. The same fixture
  now performs **zero retained-control lookups**. The observer remains active to
  detect A-to-B-to-A changes; this is not a claim of zero observation work.

Fourteen new browser cases cover the fixes and their identity boundaries. A
negative case caught a section-wrapped record label during implementation.
Final diff review also reproduced a sibling-row removal interrupting an
unchanged row: content dependencies now end at the containing record, while
ancestor attributes/removal remain checked. Both were fixed before final
validation. Final verification: **405 native browser cases**
(135 each Chromium/Firefox/WebKit), **49 focused React/unit cases**, and **12
production embed cases** in Chromium. React and embed production builds/JSX
guards, React typecheck, changed-file lint/format and diff checks pass.

Embed SHA-256:
`4a7093a812d94fded96595452ab5fc423b4d5eefdaddeeee83637fcafe46fd8d`.

All traffic uses local fixtures. Local context still depends on page structure:
unlabelled content changes within the same group can require a fresh reading,
and hidden application state is not observable. No backend changes or backend
reruns are included in this follow-up. Fresh independent review/CI, repository
approval and coordinated final-build real-backend acceptance remain release
gates. No versions, packages, tags or deployments changed.

### Greptile 3/5 follow-up: nested item ownership (2026-09-29)

The current-head review of `0d8a134` found that a label inside a nested section
could change from Account A to Account B while the outer Delete reference stayed
valid. Five browser variants (section, form, fieldset, group and region) each
reproduced an actual unwanted click before the fix. Symmetric cases with the
button nested and the label outside also failed during verification.

The identity model now separates two dependencies:

- The control's complete local scope, including nested groups and records.
  Nested layout tags never make item content irrelevant to its action. Without
  an explicit record, enclosing groups are bound conservatively in either
  direction; there is still no automatic whole-body fallback.
- Ancestor record identity, excluding sibling child records. The selected
  item remains bound to its containing order while another item's update does
  not invalidate it. Ancestor attributes/removal, names, URLs, native operation
  checks and monotonically stale handles remain in place.

This corrects an overbroad assumption in two earlier positive fixtures: an
`aside` inside the selected group cannot be assumed unrelated. Those fixtures
now place the independent region outside the selected group, and explicit
negative cases require fresh approval for changes inside it. This is deliberate
conservative refusal, not a guarantee that arbitrary DOM updates are harmless.
Tooltips and widget UI remain transient. Idle callbacks still use weak revision
counters without scanning retained controls or reading their content.

Eighteen browser regressions and two React consent cases were added. Validation:
**459 native browser cases** (153 each Chromium/Firefox/WebKit), **51 focused
React/unit cases**, **12 production embed cases** in Chromium, React/embed
production builds and JSX guards, React typecheck, changed-file lint/format and
diff checks pass. All browser/API traffic uses local fixtures.

Embed SHA-256:
`891c734bcfedcdc6f4b4456db6f8099bec441722dcd251ab913cba74d3b292d5`.

No backend changes or backend reruns in this follow-up. Hidden application state
and post-dispatch host handlers remain outside DOM identity guarantees. Fresh
independent review/CI, repository approval and final-build real-backend acceptance
remain required. Nothing was published or deployed.
