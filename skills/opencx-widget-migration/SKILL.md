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

Widget 5.0.0 is the stable release published on 2026-09-30. Re-check registry tags
before selecting a newer target; use a prerelease only when requested. Keep the
old version and configuration for rollback. Customers staying on v4 should pin
`4.0.63`, since `latest` can move to a new major. For a repeatable stable migration:

```bash
npm install --save-exact @opencx/widget-react@5.0.0
```

Use the customer's package manager. For headless integrations, install
`@opencx/widget-react-headless@5.0.0` and
`@opencx/widget-core@5.0.0`. Match any other directly installed OpenCX widget
packages to that exact version. React 18 and 19 are supported.

For script embeds, use:

```html
<script
  defer
  src="https://unpkg.com/@opencx/widget@5.0.0/dist-embed/script.js"
></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    window.initOpenScript({ token: 'WIDGET_TOKEN' });
  });
</script>
```

Keep the default popover unless the customer also requests the companion. The
companion is selected by `displayMode: 'companion'`. Omitted or false `streaming`
keeps polling, including with v2 agents and verified users. `streaming: true`
requires organization support and uses SSE for live replies; polling still
reconciles persisted history and human replies. Layout and delivery are independent.

## Review migration-sensitive behavior

- **Self-hosted assets:** 5.0.0's `dist-embed/script.js` is a self-contained classic
  script; copying it is sufficient for the widget code. Repeated loads reuse one
  runtime. Earlier betas used `widget.js` and lazy chunks; preserve those complete
  versioned directories for already-open tabs when upgrading. API, attachment and
  asset requests still need the host's normal permissions.
- **Sanitized HTML:** bot/agent replies remain sanitized. Configured footers
  preserve safe color, typography and spacing. Scripts, handlers, embedded frames,
  resource-loading CSS and positioning are still removed. Re-test custom markup.
- **User message shape:** `deliveredAt` is restored as a deprecated alias of
  `timestamp`, including queued messages and restored history.
- **Runtime defaults:** unchanged configurations keep polling and disable personal
  service connections. Existing beta users must opt in with `streaming: true`
  and `capabilities.connections: true` to retain those features. Page collection
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

`features.dictation`, `features.pageContext`, `features.clientTools` and
`features.pageActions` narrow the organization's enabled features. They cannot
turn on disabled organization features. Page marks require the explicit
page-context opt-in. Attachments have no per-embed toggle; remove any experimental
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
  customers to add renewal. Updating a token for the same signed owner and access
  scope preserves the session; user, account, organization or scope changes reset
  active state. Do not remount the provider by keying it to the token string.
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
  sufficient. There is no public `useElicitation` hook in 5.0.0.
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
streaming, Stop, another send during a reply, and reloaded turn history. For
companion integrations, test layouts, Escape, mobile sizing, and current context
after navigation. State which flows were tested against a real backend.

Retain the previous version and configuration in version control for rollback.
Report the selected version, changed integration files, required hosting changes,
and outstanding checks. The package migration does not require the customer to
publish OpenCX packages or modify OpenCX's release tags.
