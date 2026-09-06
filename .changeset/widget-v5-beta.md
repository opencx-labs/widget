---
'@opencx/widget-core': major
'@opencx/widget-react-headless': major
'@opencx/widget-react': major
'@opencx/widget': major
---

Widget v5 — the streaming agent release.

**Added**

- `displayMode: 'companion'`: a bottom-centered pill that morphs into a floating chat panel, a docked sidebar, or a fullscreen column, with every knob under `companion.*` (layouts, resting layout, sidebar side/mode/width, compact geometry, pill label, quick-ask tools, bubbles, scroll lock).
- The streaming engine, selected by the backend per org: replies stream live with a steps trace and inline rendered UI, can be stopped mid-reply, queue messages sent mid-turn, steer a follow-up into the live turn, retry a failed turn, reconnect after a disconnect, and re-render settled turns faithfully after a reload.
- `features`: per-embed toggles (`preamble`, `inlineUi`, `dictation`, `pageContext`, `clientTools`) that can only narrow what the organization enabled.
- `context` accepts a function, resolved at every send, and two well-known keys — `page` and `entity` — the agent reads as "here" and "this"; the entity shows as a removable pill in the composer.
- Page marks (+ `pageMarkHighlightDurationMs`): when the organization enables it, the visitor marks anything on the host page and the agent can point back at it; an embed opts out with `features.pageContext: false` / `features.clientTools: false`.
- Voice dictation in the composer, clarification questionnaires that replace the composer while the agent waits on an answer, ↑/↓ recall of sent text.
- `messageActions.copy`: a Copy button under each AI reply (on by default in the companion, off in the popover so a v4 embed looks the same after upgrading), `router.restoreLastSession`, `onUiAction`, `showStepToolIO`, and an `errorComponent` prop on `Widget` / `WidgetProvider`.
- `components` keys `agent_chat_steps`, `agent_chat_spec`, `agent_chat_questions`; headless `useAgentChatUi`, `useBot`, `useDisplayMode`, `useDictation`, `useWidgetLayout`; React `HostedSpecRenderer` and `segmentContent` for host pages that show widget transcripts.
- Around 70 new translation keys in all 38 locales.

**Breaking**

- The embed is now two files: `dist-embed/script.js` is a tiny loader that injects `dist-embed/widget.js` (an ES module with lazy chunks). Self-hosters must publish the whole `dist-embed` directory with CORS headers.
- Agent and bot messages, and `chatFooterItems`, are sanitized: inline `style`, `<script>`, `<iframe>`, media tags and `data:` images are stripped.
- `WidgetUserMessage.deliveredAt` was removed (`timestamp` carries the same instant); `pending` and `markedElements` were added.
- A failed initialization renders nothing (previously the loading state stayed mounted); pass `errorComponent` to render your own failure surface.
- `zod` moved from v3 to v4 in `@opencx/widget-react` and `@opencx/widget-react-headless`.
- Streaming needs an OpenCX backend that returns the `agent` block from `/widget/v2/config`; against an older backend the widget runs the classic engine exactly as v4 did.

Unchanged: the classic popover, `inline`, `customComponents`, the `components` prop keys of v4, `cssOverrides`/`theme`, `headerButtons`, `hooks`, `ExternalStorage`, storage keys, and the `context` a host passes — it rides along with every send as before.
