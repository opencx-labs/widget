---
name: opencx-widget-migration
description: Migrate a customer's OpenCX widget integration from v4 to v5, checking package versions, self-hosted embed assets, custom rendering, streaming, companion layouts, and page context.
---

# Migrate OpenCX widget v4 to v5

Work in the customer's application using public packages and declarations. First
identify its script URL or installed packages, custom slots, CSS overrides,
authentication, storage, and hosting arrangement. Preserve those choices except
where the migration requires a change. This skill does not require another skill.

## Choose and install the target version

```bash
npm view @opencx/widget-react dist-tags --json --prefer-online
```

Verified on 2026-09-06: v5 is `5.0.0-beta.0` under `beta`; `latest` remains
`4.0.62`. Re-check before selecting a target. Explain when the selected target is
a prerelease. For a repeatable beta.0 migration:

```bash
npm install @opencx/widget-react@5.0.0-beta.0
```

Use the customer's package manager. For headless integrations, install
`@opencx/widget-react-headless@5.0.0-beta.0` and
`@opencx/widget-core@5.0.0-beta.0`. Match any other directly installed OpenCX widget
packages to that exact version. React 18 and 19 are supported.

For script embeds, use:

```html
<script
  defer
  src="https://unpkg.com/@opencx/widget@5.0.0-beta.0/dist-embed/script.js"
></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    window.initOpenScript({ token: 'WIDGET_TOKEN' });
  });
</script>
```

Keep the default popover unless the customer also requests the companion. The
companion is selected by `displayMode: 'companion'`; streaming is selected by the
organization's backend configuration. These are independent choices.

## Review migration-sensitive behavior

- **Self-hosted assets:** v5's `script.js` loads `widget.js`, which can load a lazy
  chart chunk. Publish the entire `dist-embed` directory at a versioned URL; retain
  old assets for already-open pages. A short cache lifetime for `widget.js` alone
  does not protect an open tab whose old module later requests a deleted chunk.
  Cross-origin module requests need CORS. The loader forwards its nonce; verify
  the host CSP also allows initialization and lazy imports.
- **Sanitized HTML:** bot/agent replies and `chatFooterItems` are sanitized. Custom
  inline styles, scripts, iframes, and other disallowed markup may disappear.
  Use `cssOverrides` for styling and supported render slots for custom UI.
  Re-test existing markup rather than promising all v4 customizations are unchanged.
- **User message shape:** `WidgetUserMessage.deliveredAt` is removed. Read
  `timestamp` instead. Account for optional `pending`, `markedElements`, and
  `mentions` when a custom renderer displays user messages. This can affect runtime
  JavaScript consumers too, not only TypeScript compilation.
- **Initialization failure:** `Widget` and `WidgetProvider` render nothing by
  default after a failed initialization and log an error. In React, provide
  `errorComponent={(error) => ...}` if the host needs a visible failure state.
- **Styling and branding:** re-check composer CSS, opening motion, and reduced
  motion. The sessions list can use the organization's agent branding; `bot.name`
  and `bot.avatarUrl` override it. Header copy uses the organization unless
  overridden through `textContent.*.headerTitle`.
- **Backend support:** a backend without an `agent` configuration block selects
  the classic engine. No frontend `streaming: true` option enables the backend.
- **Dependency overrides:** React/headless now depend on zod v4. Check overrides
  that force zod v3 and update the lockfile through the package manager.

## Adopt v5 options when requested

```ts
import type { WidgetConfig } from '@opencx/widget-core';

const options: WidgetConfig = {
  token: 'WIDGET_TOKEN',
  displayMode: 'companion',
  companion: {
    layouts: ['compact', 'sidebar', 'fullscreen'],
    defaultLayout: 'compact',
    sidebar: { side: 'auto', mode: 'floating', width: 400 },
  },
  features: { dictation: false },
  context: () => ({
    page: { url: window.location.href, title: document.title },
  }),
};
```

Install matching `@opencx/widget-core` explicitly when importing `WidgetConfig`
in the host application, and type-check the options against that declaration.

`features.dictation`, `features.pageContext`, and `features.clientTools` narrow the
organization's enabled features. They cannot turn on disabled organization
features. Attachments have no per-embed toggle. Page marks use the organization's
page-context feature; remove any experimental `enablePageMarks` option.

The host's `context` still rides with every send, including when
`features.pageContext` is false. Use a function reading current state for SPAs.
For React beta.0, keep changing values in a ref/store read by that function rather
than assuming a replaced `options.context` updates the classic sending engine.
URL changes refresh the entity pill; for changes without navigation, dispatch
`window.dispatchEvent(new Event('opencx:context-changed'))`. A context callback
must read fresh state, not capture an obsolete route value.

`mentions.items` or `mentions.search` configure the composer's mention picker.
Mention records use `type`, `id`, and `title`, with optional metadata. Selected
mentions are sent in `clientContext.mentions` when page context is enabled.

For custom headless streaming UIs, inspect `useAgentChatUi()` for `liveItems`,
`turnSources`, `isStreaming`, `stop`, `queuedUserMessages`, `removeQueued`,
`turnFailed`, `retryFailedTurn`, and `pendingClarification`. The stock React widget
already renders these. A message sent during streaming may steer the live turn;
other sends queue. Do not promise that every second message becomes a queue pill.

## Verify and report

Build and type-check the customer app. Test the default popover, custom slots and
CSS, message round trips, attachments, and history after reload. If enabled, test
streaming, Stop, another send during a reply, and reloaded turn history. For
companion integrations, test layouts, Escape, mobile sizing, and current context
after navigation. State which flows were tested against a real backend.

Retain the previous version and configuration in version control for rollback.
Report the selected version, changed integration files, required hosting changes,
and outstanding checks. The package migration does not require the customer to
publish OpenCX packages or modify OpenCX's release tags.
