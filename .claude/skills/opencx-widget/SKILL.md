---
name: opencx-widget
description: Working in the OpenCX widget monorepo (@opencx/widget-core, widget-react-headless, widget-react, widget). Use when adding or changing a widget configuration option, a custom component slot, a translation, the companion shell, the streaming agent engine and its multi-send queue, page marks, @-mentions, dictation, the embed loader, or when releasing. Encodes the package boundaries, the "how Ali adds a config feature" convention, the feature-narrowing rule, and the release flow.
---

# OpenCX widget

Four publishable packages, always released together at one version (changesets
`fixed` group — never bump a subset):

| Package                         | Owns                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@opencx/widget-core`           | Framework-neutral runtime: `WidgetCtx` and its contexts (contact, session, message, router, unread, csat, dictation, storage), the OpenAPI client, `WidgetConfig` types, translations. No React at runtime. |
| `@opencx/widget-react-headless` | `WidgetProvider` + hooks (`useConfig`, `useMessages`, `useSessions`, …) and the streaming engine (`useAgentChat`, `useAgentChatUi`). No styling.                                                    |
| `@opencx/widget-react`          | The styled widget: popover and companion shells, screens, composer, json-render inline UI, page marks. Exports `Widget`, `HostedSpecRenderer`, `segmentContent`.                                    |
| `@opencx/widget`                | The embed: `dist-embed/script.js` (classic loader) + `dist-embed/widget.js` (ES module) + lazy chunks. Installs `window.initOpenScript`.                                                            |

Tooling packages `@opencx/tsconfig` and `@opencx/eslint-config` version independently.
`playground/payla` is a demo app (not a workspace member); `examples/*` are consumer smoke apps.

## Non-negotiable rules

- **Dependency direction**: core ← headless ← react ← embed. Core never imports React at runtime; react never reaches into headless internals — only the barrels.
- **One log prefix**: `import { log } from '@opencx/widget-core'`; never `console.*` in library code. The widget runs inside customers' pages.
- **One engine switch**: `widgetCtx.streaming` requires both `config.streaming === true` and backend `agent.streaming`; omission keeps polling. Accepted work retains its transport until it settles. `ChatScreen` picks `AgentChatMain` or `ChatMain`; `MessageCtx.sendMessage` routes to the registered streaming handler or the blocking send. Do not add a second flag.
- **Feature narrowing** (`packages/core/src/context/widget-agent.ts`): read the resolved `widgetCtx.features` (`dictation`, `attachments`, `pageContext`, `clientTools`, `pageActions`). Dictation and attachments inherit the org value unless the embed disables them. Page context, client tools and page actions require explicit embed `true` plus org permission; actions require all three. `resolveSendFeatures` forwards only supported backend toggles (`preamble`, `inline_ui`, `page_context`, `client_tools`, `page_actions`); local dictation and attachment controls are not sent as feature flags. `enablePageMarks` is not an option.
- **Host context always rides**: `config.context` (object or function, resolved at send time) is sent with every message on both engines, as in v4. `features.pageContext` gates only the widget-made page context (page marks, picked elements) and its affordances.
- **Context follows the page, on us**: pass `context` as a function (the send resolves it fresh) and the entity pill re-reads it when the host URL changes — `useHostLocation` in headless watches `popstate`/`hashchange` and polls `location.href` for silent `pushState` routers. For a change with no URL change the host fires `window.dispatchEvent(new Event('opencx:context-changed'))` (`HOST_CONTEXT_CHANGED_EVENT`). In React, use a context callback that reads current state; replacing `options.context` does not update every initialized core context. Never ask hosts to re-init the widget on navigation.
- **One wire body**: `buildSendMessageBody` in `message.ctx.ts` builds the request for both the blocking send and the stream. Both endpoints take `WidgetSendMessageInputDto`.
- **Companion defaults live at the use site** with a matching `@default` in the `WidgetConfig` JSDoc — the repo convention (below), not a defaults table.
- **Motion**: tokens in `packages/react/src/motion.ts`; CSS animations in `packages/react/index.css` with the `opencx-` prefix; `MOTION.md` + `motion-contract.spec.ts` enforce durations/easing. Keybindings in `utils/keybindings.ts` — never a literal key check in a component.
- **Styling hooks**: every customer-styleable node carries `{...dc('area/component')}`; add the name to `OpenCxComponentNameU` in core first.

## Adding a configuration option (the house style)

Follow the pattern of `accessibility.widgetTriggerButton.label`, `hooks.onMessageReceived`, `customComponents['message::after']`:

1. Declare it ONCE in `packages/core/src/types/widget-config.ts` inside `WidgetConfig`, with a JSDoc that says what it does for the product and carries `@default`. Group related knobs under a noun (`router.*`, `companion.sidebar.*`, `features.*`); a single switch stays flat (`inline`, `collectUserData`).
2. Read it where it is used via `useConfig()` and apply the default there: `const label = accessibility?.widgetTriggerButton?.label ?? 'Chat with us'`. If core needs it, read `this.config` in the context that owns the behavior.
3. Render slots go under `customComponents` and receive `{ react: typeof React, ...ComponentContext }` so host code renders with the widget's React. Lifecycle callbacks go under `hooks`. Replaceable internals go through the `components` prop keys (`LiteralWidgetComponentKey`).
4. Test the behavior (a `*.spec.ts(x)` beside the code, in `__tests__/`), not the option's existence.
5. Add a changeset with all four packages (`pnpm cs`). Do not hand-edit versions or CHANGELOGs.

Before renaming or removing any public option or export, grep the dashboard in the
sibling `opencx` repo (`dashboard/apps/dashboard/app`) — it consumes `displayMode`,
`context`, `onUiAction`, `showStepToolIO`, `HostedSpecRenderer`,
`segmentContent`, and `customComponents['message::after']`.

## Adding a translation key

Add the key to `TranslationInterface` in `packages/core/src/translation/index.ts` and to
EVERY locale file (38). `translation.spec.ts` fails on a missing key. Use `t(key, params)`
for interpolation — templates use `{name}` placeholders (e.g. `'{count} Queued'`); never
concatenate numbers and words in JSX. Core code uses `translate(config, key)`.

## Where things live

- Unread state: core `UnreadCtx` derives counts from loaded session rows and owns mark-read requests. Headless `useUnread` reads it; browser shells mount `useUnreadViewing` once with actual transcript visibility. Do not treat opening the list or the Companion input bar as reading a session.
- Streaming engine: `packages/react-headless/src/agent-chat/` — `useAgentChat.ts` (queue, steer, stop, retention, reconnect), `agent-chat-stream.ts` (UI parts → render items), `agent-turn-sources.ts` (settled turns), `ask-questions.ts` + `pending-clarification.ts`, `AgentChatContext.tsx` (the `useAgentChatUi` value the styled layer reads).
- Companion shell: `packages/react/src/companion/` — `WidgetCompanion.tsx` (state machine pill/input/chat + isOpen sync), `CompanionContent.tsx`, `LayoutPicker.tsx`, `useCompanionHostEffects.ts` (sidebar app-frame + scroll lock, leased), `companion-geometry.ts`. Layout state: headless `useWidgetLayout` + core `companion-layout.ts` (normalization) + `StorageCtx` (visitor preferences).
- Inline UI: `packages/react/src/json-render/` — `catalog.ts` (the component vocabulary), `registry.tsx` (renderers), `props.ts` (zod props), `SpecRenderer.tsx`, `ui-prompt.ts` (CODEGEN ONLY: `pnpm -F @opencx/widget-react gen:ui-prompt` writes the prompt into the backend repo).
- Page marks: `packages/react/src/page-marks/` (visitor marks) and `agent-mark.ts` (the agent's `highlight_element` tool, driven by `AgentChatPageEffects`).
- Mentions: `packages/react/src/screens/chat/useMentions.ts` (the `@query` at the caret, host `search` or in-widget filter of `items`, grouping — three per `type` behind a "see more" — the picked list kept in step with the text, and the caret/Backspace rules that make an `@Title` one unit), `MentionPicker.tsx` (grouped menu + preview card, portaled to the frame's themed root via `closest('[data-version]')` because the footer clips overflow), `MentionText.tsx` (the `@Title` highlight, rendered both in `ChatInput`'s mirror layer under the textarea and in `components/UserMessage.tsx`'s sent bubble), `caret-position.ts` (caret geometry + the mirror's layout copy); the wire shape is `clientContext.mentions` (`mergeSendContext`), gated by `features.pageContext` like page context.
- Dictation: core `dictation/` + `DictationCtx`; headless `useDictation`; react `DictationMicButton`.
- Backend contract: `packages/core/src/api/schema.ts` is GENERATED (`pnpm gen:sdk` against a local backend at `http://localhost:8080`). Never hand-edit. Use `this.client.GET/POST(...)` for endpoints; only the two stream URLs are built by hand (the AI SDK transport needs raw URLs).

## Commands

```bash
pnpm install
pnpm build            # turbo, all packages (headless/react type-check against built dist)
pnpm type-check
pnpm lint
pnpm test             # vitest per package
pnpm x                # clean:dist + build + lint + type-check + test (the publish gate)
pnpm -F @opencx/widget-react test -- --run src/companion
```

Headless and react resolve core/headless from `dist`: after changing core's public
types, `pnpm -F @opencx/widget-core build` before type-checking the consumers.

## Releasing

Stable v5 is published under `latest`; beta is a separate prerelease channel.
Check registry tags and `.changeset/pre.json` before choosing a release channel.
Use Changesets to keep all four public packages at one version:

```bash
pnpm install --frozen-lockfile
pnpm csv              # apply pending changesets: versions and changelogs
pnpm x                # clean production builds, JSX checks, lint, types, tests
```

Commit the generated versions and changelogs through the repository's release PR
before publishing. Build and publish from the merged commit; if the merge changes
files beyond the validated tree, validate that tree first. Do not skip protected
review or include unrelated working-tree edits.

For a stable release:

```bash
pnpm -r --filter @opencx/widget-core --filter @opencx/widget-react-headless \
  --filter @opencx/widget-react --filter @opencx/widget \
  publish --tag latest --access public --no-git-checks
```

This publishes the packages sequentially and converts workspace dependencies to
released versions. Complete npm's login or publish approval only if requested by
the CLI; do not pre-supply an OTP. For a partial publish, first check exactly which
versions exist and retry only missing packages with the same validated artifacts.

Verify all four registry versions and internal dependencies, downloaded tarball
contents, and the pinned embed CDN script. npm can acknowledge a publish before
its metadata or tarball is available; poll with a bounded timeout and report any
remaining gap. Check the GitHub release/tag separately and point it at the merged
release commit. Publication does not prove that OpenCX consumers have upgraded.

Only enter Changesets pre mode for an explicitly requested prerelease line, and
publish it under its intended tag rather than `latest`.

See [references/architecture.md](references/architecture.md) for the message lifecycle and
the streaming turn state machine.
