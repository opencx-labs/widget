---
name: widget-v4-to-v5
description: Migrate an OpenCX widget embed or integration from v4 (4.0.x) to v5 (5.0.0-beta+). Use when upgrading @opencx/widget, @opencx/widget-react or @opencx/widget-react-headless, when a v4 customization stopped working after the bump, or when adopting the v5 companion shell, streaming, features, page context, or page marks. Lists every breaking change with the fix, then the opt-in features.
---

# Migrating the OpenCX widget from v4 to v5

v5 keeps every v4 customization working by default: the classic popover, `inline`,
`customComponents`, the `components` prop, `cssOverrides`/`theme`, `headerButtons`,
`hooks`, `ExternalStorage`, storage keys, translations, and the `context` you pass (it
still rides along with every send). Streaming and the companion shell are opt-in
(streaming by the organization's backend setting, companion by `displayMode`).

## Step 1 — install

```bash
# script embed: switch the tag to the beta (stays on 4.x under @latest until the final release)
<script src="https://unpkg.com/@opencx/widget@beta/dist-embed/script.js"></script>

# npm
pnpm add @opencx/widget-react@beta   # or @opencx/widget-react-headless@beta
```

`@opencx/widget-react` and `-headless` keep the React 18–19 peer range. Both now depend
on `zod` v4 (they used v3); nothing changes unless you pinned zod v3 through them.

## Step 2 — walk the breaking list

| Change | Who it affects | What to do |
| --- | --- | --- |
| The embed is two files: `dist-embed/script.js` (loader) injects `dist-embed/widget.js` (ES module) plus lazy chunks. | Anyone who copied `script.js` to their own CDN. | Publish the whole `dist-embed/` directory, serve it with `Access-Control-Allow-Origin`, and keep old chunks on redeploy (or short-TTL `widget.js`). Nonce-based CSP: the loader copies the nonce from its own tag. unpkg users: nothing to do. |
| Agent/bot messages and `chatFooterItems` are sanitized (GitHub HTML schema). | Embeds injecting `style=`, `<iframe>`, `<script>`, media tags or `data:` images into footer items or relying on them in bot replies. | Move styling to `cssOverrides` (`[data-component="chat/agent_msg/msg"] …`); links, lists, headings, code, images with `http(s)` src still render. |
| `WidgetUserMessage.deliveredAt` was removed; `pending?` and `markedElements?` were added. | `customComponents['message::after']`, `components` overrides, headless consumers reading user messages. | Use `timestamp` (same instant). Type-only change. |
| A failed initialization renders nothing instead of leaving the loading state mounted. | Everyone. | Optional: pass `errorComponent={(error) => …}` to `Widget` / `WidgetProvider` to show your own failure surface. Nothing is thrown into your React tree. |
| The composer card has a hairline border and follows the theme background; the popover opens with a short spring; OS reduced-motion is honored. | Pixel-level `cssOverrides` on the composer. | Re-check `[data-component="chat/input_box/*"]` overrides. |
| Streaming, dictation, page marks and highlights are switched on per organization in the dashboard and need a backend that returns the `agent` block from `/widget/v2/config`; an embed can only switch them off (`features.*`). | Self-hosted or pinned backends. | Against an older backend the widget runs the classic engine exactly as v4. Upgrade the backend to stream. |
| Sessions list: the AI assignee's name/avatar default to the organization's agent branding from the backend (was the literal "AI Support Agent"). | Embeds without `bot.name`. | Set `bot: { name, avatarUrl }` to override, as before. |

Not breaking, but new defaults worth knowing: `bot.avatarUrl` now defaults to the
organization's agent avatar; the header keeps naming the organization (override with
`textContent.*.headerTitle`).

## Step 3 — internal consumers (OpenCX dashboard, inbox)

- `HostedSpecRenderer`, `segmentContent`, `ContentSegment` from `@opencx/widget-react`
  render agent inline UI outside the widget; `onUiAction` on the renderer and
  `WidgetConfig.onUiAction` receive `{ type: 'test-phone-agent', payload }`.
- `showStepToolIO: true` expands step rows with tool arguments/results (debug only).
- Headless: `useAgentChatUi()` exposes `isStreaming`, `liveItems`, `turnSources`,
  `liveTurnKey` (nullable), `turnFailed`, `retryFailedTurn`, `queuedUserMessages`,
  `removeQueued`, `stop`, `pageEffects`, `pendingClarification`. `useBot()` returns a full
  `Agent`. `useMessages().messagesState.isSendingMessage` is `true` while a reply streams.
- Core: `widgetCtx.features` replaces any per-feature getters; `config.features.dictation`
  (not `dictate`).

## Step 4 — adopt what you want

```ts
initOpenScript({
  token,
  // The companion shell (bottom-center pill → floating panel / sidebar / fullscreen).
  displayMode: 'companion',
  companion: {
    layouts: ['compact', 'sidebar', 'fullscreen'],
    defaultLayout: 'compact',
    sidebar: { side: 'auto', mode: 'floating', width: 400 },
    pillLabel: 'Ask us…',
    quickAskTools: 'history-only',
    bubbles: false,
  },
  // Per-embed narrowing of what the organization enabled.
  features: { dictation: false, pageContext: true, clientTools: true },
  // Resolved at every send — the right form for SPAs. `page` and `entity` are what the
  // agent reads as "here" and "this"; the entity shows as a removable pill.
  context: () => ({
    page: { url: location.href, title: document.title },
    entity: { type: 'order', id: currentOrder.id, title: `#${currentOrder.number}` },
    plan: 'pro',
  }),
  // Page marks and highlights follow the organization's switches; this only
  // tunes how long an agent highlight stays.
  pageMarkHighlightDurationMs: 8000,
  // "@" in the composer opens a picker; a pick shows as `@Title` in the text
  // plus a chip, and rides the send as `clientContext.mentions`. Either a
  // fixed list the widget filters, or your own (async) search. Needs the
  // org's "sees the page" switch.
  mentions: {
    items: [{ type: 'plan', id: 'pro', title: 'Pro plan', iconName: 'CreditCard' }],
    // or: search: async (query) => (await api.search(query)).map(toMention),
  },
  router: { restoreLastSession: true },
  // A Copy button under AI replies. Default: on in the companion, off in the
  // popover, so an upgraded v4 embed looks the same until it asks.
  messageActions: { copy: true, display: 'always' }, // display defaults to 'hover'
});
```

Replaceable v5 internals through the `components` prop: `agent_chat_steps`
(`{ steps, active }`), `agent_chat_spec` (`{ parts }`), `agent_chat_questions`
(`{ request }`). New styling hooks are listed in `OpenCxComponentNameU`
(`chat/streaming_turn/*`, `chat/queued_sends/*`, `chat/input_box/page_mark_*`,
`companion/*`). New translation keys can be overridden through `translationOverrides`.

## Step 5 — verify

- Classic embed: popover opens, a message round-trips, attachments upload, CSAT and
  suggested replies render, `customComponents` slots render, `cssOverrides` apply.
- If your org streams: a reply streams with a steps trace; Stop works; a second message
  sent mid-reply queues (pill above the composer) and drains; reload shows the same turn.
- Companion: pill → panel → sidebar/fullscreen; Escape dismisses; `WidgetRef.newChat({ message })` opens the conversation.
- Console shows no `[opencx]` warnings.
