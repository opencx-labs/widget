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

These examples pin the published stable release `5.4.2`. Re-check registry tags
before selecting a newer target; use a prerelease only when requested. Keep the
old version and configuration for rollback. Customers staying on v4 should pin
`4.0.63`, since `latest` can move to a new major. For a repeatable stable migration:

```bash
npm install --save-exact @opencx/widget-react@5.4.2
```

Use the customer's package manager. For headless integrations, install
`@opencx/widget-react-headless@5.4.2` and
`@opencx/widget-core@5.4.2`. Match any other directly installed OpenCX widget
packages to that exact version. React 18 and 19 are supported.

For script embeds, use:

```html
<script
  defer
  src="https://unpkg.com/@opencx/widget@5.4.2/dist-embed/script.js"
></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    window.initOpenScript({ token: 'WIDGET_TOKEN' });
  });
</script>
```

Keep the default popover unless the customer also requests the companion. The
companion is selected by `displayMode: 'companion'`. From 5.5.0 the script embed
streams when `streaming` is omitted and the organization supports it;
`streaming: false` keeps polling. In the React and headless packages, omitted or
false keeps polling. Streaming requires organization support and uses SSE for
live replies; polling still
reconciles persisted history and human replies. Layout and delivery are independent.

## Review migration-sensitive behavior

- **Self-hosted assets:** stable v5's `dist-embed/script.js` is a self-contained classic
  script; copying it is sufficient for the widget code. Repeated loads reuse one
  runtime. Earlier betas used `widget.js` and lazy chunks; preserve those complete
  versioned directories for already-open tabs when upgrading. API, attachment and
  asset requests still need the host's normal permissions.
- **Sanitized HTML:** bot/agent replies remain sanitized. Configured footers
  preserve safe color, typography and spacing. Scripts, handlers, embedded frames,
  resource-loading CSS and positioning are still removed. Re-test custom markup.
- **User message shape:** `deliveredAt` is restored as a deprecated alias of
  `timestamp`, including queued messages and restored history.
- **Runtime defaults:** unchanged configurations disable personal service
  connections. From 5.5.0 the script embed streams when the organization supports
  it; React and headless integrations keep polling unless `streaming: true`.
  Existing beta users must opt in with `capabilities.connections: true`, plus
  `streaming: true` in React or headless, to retain those features. Page collection
  requires `features.pageContext: true`; agent actions additionally require
  `features.clientTools: true` and `features.pageActions: true`. Page context
  and actions default off and require organization support plus embed opt-in.
  Pointing and actions also require streaming and a compatible renderer. The
  stock UI asks the visitor for confirmation before every page action. Companion
  does not enable these flags; the popover can use them too. Host-supplied context
  remains shared independently of automatic page collection.
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
- **Headless setup:** `WidgetProvider` needs a nonempty `components` registry
  containing `fallback` and a `storage` adapter for reload persistence. Declare
  rich replies, structured questions or page effects only after implementing
  their renderer and interactions, including page-action consent.
- **Starters:** `initialQuestions` works with polling. With usable starters,
  `requireInitialQuestion: true` requires a selection before typing. Companion
  places starters above the disabled composer; the popover hides the composer
  until a question is selected.

## Account for the selected stable v5 version

- 5.1.0 adds `streamingFetch` and `resumeInterruptedTurn()` for React Native
  streaming. Expo needs the documented polyfills and foreground/connectivity
  resume handling; use the public headless guide for setup.
- 5.2.0 adds `WidgetAgentMessage.messageOptions` and `SendMessageInput.optionReply`.
  Custom renderers must restrict taps to the newest unpicked options message of
  an open session and retain the picked choice as a receipt.
- 5.3.0 adds `features.attachments: false`. It hides upload controls, ignores
  dropped/pasted files, clears queued files and skips page-mark snapshot uploads.
  It cannot enable an organization-disabled feature.
- 5.4.0 adds default unread dots. `unreadIndicator: 'count'` shows unread sessions
  in loaded history; `false` hides built-in marks while leaving the count hook and
  custom-trigger count available. Older backends without unread state show no
  marks. A headless browser shell needs `useUnreadViewing` below its trigger
  provider; native shells must report actual viewing through `unreadCtx` instead
  of mounting the browser hook. Opening a list does not mark its rows read.
- 5.4.1 restores `lastAIResMightSolveUserIssue` after completed streamed replies
  when the backend supplies the verdict. An accepted send resets it; aborted,
  failed, disconnected, superseded or different-session turns cannot carry a
  positive result into the current session.
- 5.4.2 reports the first visible view even when a session has no unread reply,
  so later replies can light the indicator. Newly created sessions join loaded
  history immediately. A custom headless shell must report actual transcript
  visibility even when its unread count is zero.
- 5.5.0 makes the script embed stream when the organization supports it, without
  `streaming: true`. Keep an existing embed on send/poll with `streaming: false`.
  React and headless integrations are unchanged.

Preserve the customer's requested target version. These additions do not require
turning on streaming, page access, or personal connections for an existing embed.
See [session and feedback hooks](https://docs.open.cx/widget/custom-components-headless).

## Adopt v5 options when requested

```ts
import type { WidgetConfig } from '@opencx/widget-core';

const publicPageTitles: Record<string, string> = {
  '/help': 'Help center',
  '/pricing': 'Pricing',
};

const options: WidgetConfig = {
  token: 'WIDGET_TOKEN',
  displayMode: 'companion',
  streaming: true,
  companion: {
    layouts: ['compact', 'sidebar', 'fullscreen'],
    defaultLayout: 'compact',
    sidebar: { side: 'auto', mode: 'floating', width: 400 },
  },
  features: { dictation: false },
  context: () => {
    const { origin, pathname } = window.location;
    const title = publicPageTitles[pathname];
    return title ? { page: { url: origin + pathname, title } } : {};
  },
};
```

Install matching `@opencx/widget-core` explicitly when importing `WidgetConfig`
in the host application, and type-check the options against that declaration.

`features.dictation`, `features.attachments`, `features.pageContext`,
`features.clientTools` and `features.pageActions` narrow the organization's
enabled features. They cannot turn on disabled organization features. Page marks
require the explicit page-context opt-in. Remove any experimental
`enablePageMarks` option.

Share only approved context: it can enter session history and the agent's input.
The example allows known public routes and labels, omitting private routes,
query strings, fragments and dynamic titles. Adapt the allowlist to the customer
site or omit page context. `data-opencx-private` excludes sensitive page regions
from automatic collection; it cannot sanitize explicitly supplied `context`.

The host's `context` still rides with every send, including when
`features.pageContext` is false. Use a function reading current state for SPAs.
For React, keep changing values in a ref/store read by that function rather
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

## Add personal access only when needed

Installing v5 does not require personal connections or approval forms. Existing
shared integrations can keep their setup. For customers adopting per-user tools,
follow the [authentication guide](https://docs.open.cx/widget/authentication) and
verify the backend supports the flow before enabling it.

- Set `streaming: true` and `capabilities: { connections: true }` explicitly.
  Omission keeps personal connections off. A signed access grant does not turn
  on the embed UI by itself.
- Pass the authenticated backend's widget user token as `user.token`. Unsigned
  user data does not grant access. Keep organization keys and provider credentials
  on the server.
- Tokens issued with explicit `mcp_access` expire after one hour; renew them before
  expiry and after tab suspension. Chat-only tokens issued without `mcp_access`
  keep their existing non-expiring behavior. Upgrading does not require chat-only
  customers to add renewal. Updating a token preserves the session when the signed
  owner, account and normalized server-ID list stay the same. Changes to user,
  account, organization or that list reset active state. Omitting `mcp_access` and
  using `mcp_access: { server_ids: [] }` are equivalent when `account_id` is absent
  and the other identity inputs are unchanged; server-ID order is ignored. Do not
  rely on claim representation changes to reset state. The backend still enforces
  access. Do not remount the provider by keying it to the token string.
  Include `mcp_access.account_id` for account-switching products and verify custom
  storage does not restore another owner's session.
- Explicit `mcp_access: {}` without `server_ids` allows all enabled per-user
  servers, including future additions. Set a backend-derived list when restriction
  is needed; `[]` allows none. Omitting `mcp_access` entirely keeps chat-only access.
  Obtain a new scoped token before enabling personal connections.
  `capabilities.connections: false` only hides controls; enforce scope on the server.
- Personal connections persist across sessions. Pending prompts must stay bound
  to their original session and must not carry into a new one. Test Connect,
  blocked popups, cancellation, return/resume, and account switching.
- The stock UI handles form elicitation. Custom headless UIs must add the form
  list/response flow using published core declarations, including field validation,
  selection limits, decline/cancel, and expiry; rendering live text alone is not
  sufficient. There is no public `useElicitation` hook in 5.4.2.
- Simple approvals may be remembered for the exact account/server/tool/inputs/form.
  Test **Always allow**, a changed request that still asks, and **Connections →
  Saved approvals → Remove approval**. Disconnect removes the personal grant and
  its saved approvals. Shared administrator grants are not shown as personal ones.

Form elicitation is separate from OAuth and general action approval policy. Forms
must not collect credentials. Requests currently expire after 50 seconds; verify
that late responses do not execute the requested action. Customer-backend access
token reuse is optional and requires separate server-side setup; no token export
belongs in a browser callback or widget configuration.

## Verify and report

Build and type-check the customer app. Test the default popover, custom slots and
CSS, message round trips, attachments, and history after reload. If enabled, test
streaming, Stop, another send during a reply, reloaded turn history, and the
feedback flag after completed versus interrupted or superseded replies. Check
unread state on the list versus a loaded visible transcript, including its first
view with no unread replies, a hidden tab and a minimized Companion shell. For
companion integrations, test layouts, Escape, mobile sizing, and current context
after navigation. State which flows were tested against a real backend.

Retain the previous version and configuration in version control for rollback.
Report the selected version, changed integration files, required hosting changes,
and outstanding checks. The package migration does not require the customer to
publish OpenCX packages or modify OpenCX's release tags.
