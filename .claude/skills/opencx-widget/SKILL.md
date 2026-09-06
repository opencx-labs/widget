---
name: opencx-widget
description: Working in the OpenCX widget monorepo (@opencx/widget-core, widget-react-headless, widget-react, widget). Use when adding or changing a widget configuration option, a custom component slot, a translation, the companion shell, the streaming agent engine, page marks, dictation, the embed loader, or when releasing. Encodes the package boundaries, the "how Ali adds a config feature" convention, the feature-narrowing rule, and the release flow.
---

# OpenCX widget

Four publishable packages, always released together at one version (changesets
`fixed` group — never bump a subset):

| Package                        | Owns                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@opencx/widget-core`          | Framework-neutral runtime: `WidgetCtx` and its contexts (contact, session, message, router, csat, dictation, storage), the OpenAPI client, `WidgetConfig` types, translations. No React at runtime. |
| `@opencx/widget-react-headless`| `WidgetProvider` + hooks (`useConfig`, `useMessages`, `useSessions`, …) and the streaming engine (`useAgentChat`, `useAgentChatUi`). No styling.               |
| `@opencx/widget-react`         | The styled widget: popover and companion shells, screens, composer, json-render inline UI, page marks. Exports `Widget`, `HostedSpecRenderer`, `segmentContent`. |
| `@opencx/widget`               | The embed: `dist-embed/script.js` (classic loader) + `dist-embed/widget.js` (ES module) + lazy chunks. Installs `window.initOpenScript`.                        |

Tooling packages `@opencx/tsconfig` and `@opencx/eslint-config` version independently.
`playground/payla` is a demo app (not a workspace member); `examples/*` are consumer smoke apps.

## Non-negotiable rules

- **Dependency direction**: core ← headless ← react ← embed. Core never imports React at runtime; react never reaches into headless internals — only the barrels.
- **One log prefix**: `import { log } from '@opencx/widget-core'`; never `console.*` in library code. The widget runs inside customers' pages.
- **One engine switch**: `widgetCtx.streaming` (server-decided from `/widget/v2/config` → `agent.streaming`). `ChatScreen` picks `AgentChatMain` or `ChatMain`; `MessageCtx.sendMessage` routes to the registered streaming handler or the blocking send. Do not add a second flag.
- **Feature narrowing** (`packages/core/src/context/widget-agent.ts`): the org's effective features come from the backend; `config.features.*` can only switch one OFF. Read the resolved answers from `widgetCtx.features` (`dictation`, `attachments`, `pageContext`, `clientTools`), never the raw flags. An org switch alone turns a feature on for every embed; `enablePageMarks`-style opt-ins do not exist.
- **Host context always rides**: `config.context` (object or function, resolved at send time) is sent with every message on both engines, as in v4. `features.pageContext` gates only the widget-made page context (page marks, picked elements) and its affordances.
- **Context follows the page, on us**: pass `context` as a function (the send resolves it fresh) and the entity pill re-reads it when the host URL changes — `useHostLocation` in headless watches `popstate`/`hashchange` and polls `location.href` for silent `pushState` routers. For a change with no URL change the host fires `window.dispatchEvent(new Event('opencx:context-changed'))` (`HOST_CONTEXT_CHANGED_EVENT`). The React embed needs neither: a new `context` prop re-renders. Never ask hosts to re-init the widget on navigation.
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

- Streaming engine: `packages/react-headless/src/agent-chat/` — `useAgentChat.ts` (queue, steer, stop, retention, reconnect), `agent-chat-stream.ts` (UI parts → render items), `agent-turn-sources.ts` (settled turns), `ask-questions.ts` + `pending-clarification.ts`, `AgentChatContext.tsx` (the `useAgentChatUi` value the styled layer reads).
- Companion shell: `packages/react/src/companion/` — `WidgetCompanion.tsx` (state machine pill/input/chat + isOpen sync), `CompanionContent.tsx`, `LayoutPicker.tsx`, `useCompanionHostEffects.ts` (sidebar app-frame + scroll lock, leased), `companion-geometry.ts`. Layout state: headless `useWidgetLayout` + core `companion-layout.ts` (normalization) + `StorageCtx` (visitor preferences).
- Inline UI: `packages/react/src/json-render/` — `catalog.ts` (the component vocabulary), `registry.tsx` (renderers), `props.ts` (zod props), `SpecRenderer.tsx`, `ui-prompt.ts` (CODEGEN ONLY: `pnpm -F @opencx/widget-react gen:ui-prompt` writes the prompt into the backend repo).
- Page marks: `packages/react/src/page-marks/` (visitor marks) and `agent-mark.ts` (the agent's `highlight_element` tool, driven by `AgentChatPageEffects`).
- Mentions: `packages/react/src/screens/chat/useMentions.ts` (the `@query` detection, host search, grouping, picked list kept in step with the text), `MentionPicker.tsx` (grouped menu + detail card, portaled to the themed frame root), `MentionText.tsx` (the inline `@Title` highlight, also the composer's mirror layer); the wire shape is `clientContext.mentions` (`mergeSendContext`), gated like page context.
- Dictation: core `dictation/` + `DictationCtx`; headless `useDictation`; react `DictationMicButton`.
- Backend contract: `packages/core/src/api/schema.ts` is GENERATED (`pnpm gen:sdk` against a local backend at `http://localhost:8080`). Never hand-edit. Use `this.client.GET/POST(...)` for endpoints; only the two stream URLs are built by hand (the AI SDK transport needs raw URLs).

## Commands

```bash
pnpm install
pnpm build            # turbo, all packages (headless/react type-check against built dist)
pnpm type-check
pnpm lint
pnpm test             # vitest per package
pnpm x                # clean + build + lint + type-check + test (the publish gate)
pnpm -F @opencx/widget-react test -- --run src/companion
```

Headless and react resolve core/headless from `dist`: after changing core's public
types, `pnpm -F @opencx/widget-core build` before type-checking the consumers.

## Releasing

```bash
pnpm cs               # changeset: pick ALL FOUR packages, write a real summary
pnpm csv              # apply → bumps versions + CHANGELOGs (fixed group keeps them equal)
pnpm csp              # pnpm x then changeset publish
git commit -am "chore(release): vX" && git push --follow-tags
```

Pre-releases: `pnpm cs:pre` (= `changeset pre enter beta`) before `csv` → `5.0.0-beta.N`
published under the npm `beta` dist-tag; `pnpm cs:pre:exit` to leave pre mode for the final.
Always commit the version bump after publishing — an uncommitted bump once desynced the
registry from the repo.

See [references/architecture.md](references/architecture.md) for the message lifecycle and
the streaming turn state machine.
