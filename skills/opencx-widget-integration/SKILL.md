---
name: opencx-widget-integration
description: Install and configure the OpenCX chat widget in a customer website using the HTML embed, React components, or headless React hooks. Use for widget integration, branding, page context, and v5 companion setup.
---

# Integrate the OpenCX widget

Work in the customer's application. Use the published packages and public exports;
the customer does not need the widget monorepo or a local OpenCX backend.

## Select the version and integration

Inspect the existing dependency, lockfile, or script URL before changing it. Preserve
the user's version choice. Check registry tags when selecting a new version:

```bash
npm view @opencx/widget-react dist-tags --json --prefer-online
```

Widget 5.0.0 is the stable release published on 2026-09-30. These examples pin
`5.0.0`; re-check registry tags before choosing a newer version. Use a prerelease
only when requested. To remain on v4, pin `4.0.63` instead of `latest`, which can
move to a new major. Do not add v5-only options to a v4 installation. Installing
this skill does not install the widget.

| Integration | Package                                                   | Use when                                     |
| ----------- | --------------------------------------------------------- | -------------------------------------------- |
| Script      | `@opencx/widget`                                          | Adding the ready-made widget to an HTML site |
| React       | `@opencx/widget-react`                                    | Using the ready-made UI in a React app       |
| Headless    | `@opencx/widget-react-headless` and `@opencx/widget-core` | Building a custom UI and persistence flow    |

React packages support React 18 and 19. Use the project's package manager. Install
core explicitly if the application imports its types; match the widget versions
when directly depending on multiple OpenCX widget packages.

## HTML installation

Place these tags in the document head. Replace `WIDGET_TOKEN` with the widget token
from the customer's OpenCX dashboard. Keep script loading and initialization in
this order; `defer` completes before `DOMContentLoaded`.

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

For inline HTML, provide `<div id="opencx-root"></div>` in the body and set
`inline: true`. Mount only one integration on a page; do not also mount React
`Widget` beside the script embed.

Widget 5.0.0's `dist-embed/script.js` is a self-contained classic script. Copying
that file is sufficient for self-hosting the widget code; it does not fetch a
separate `widget.js` or lazy code chunks. API, attachment and configured asset
requests still need the host's normal permissions. Verify CSP with the script
and initializer. Repeated script loads reuse one runtime. Earlier betas used a
split loader; keep their complete versioned directories available for open tabs
when replacing them with 5.0.0.

## React installation

```bash
npm install --save-exact @opencx/widget-react@5.0.0
```

Mount the widget once in the app shell:

```tsx
import { Widget } from '@opencx/widget-react';

export function SupportWidget() {
  return <Widget options={{ token: 'WIDGET_TOKEN' }} />;
}
```

Use the framework's client boundary for browser integration. Read `window`,
`document`, and browser storage only on the client. The package supplies the styled
UI; do not invent a CSS package export or import monorepo source paths.

For headless work, consult the [headless guide](https://docs.open.cx/widget/custom-components-headless)
and the installed declarations. Install matching `@opencx/widget-react-headless`
and `@opencx/widget-core` versions. `WidgetProvider` requires a nonempty
`components` registry containing `fallback`; it supplies neither stock renderers
nor browser persistence. Pass a `storage` adapter when reload persistence is
needed. Hooks such as `useMessages` must run beneath it. In v5, a custom streaming UI
also uses `useAgentChatUi` for live items, stop, queued messages, and clarification.
`useMessages().messagesState` alone does not describe the whole live turn.

For streaming in React Native (Expo SDK 52+), pass `streamingFetch` from
`expo/fetch`, polyfill `structuredClone` and `TextDecoderStream` before the
widget is imported, and call `useAgentChatUi().resumeInterruptedTurn()` when
`AppState` becomes `active` and when connectivity returns. The headless package
README has the snippet.

## Configure the public API

Pass configuration under React's `options` prop or directly to `initOpenScript`.
Use the installed `WidgetConfig` declaration for exact keys and defaults.

- Branding: `theme`, `assets`, `bot`, `humanAgent`, `textContent`, `language`, and
  `translationOverrides`. Use `cssOverrides` and documented `data-component`
  selectors for styling within the widget; host-page CSS does not generally cross
  its iframe boundary.
- Placement: classic popover by default; `inline: true` for an embedded panel.
  In v5, `displayMode: 'companion'` selects the companion shell; `companion.layouts`
  supports `compact`, `sidebar`, and `fullscreen`. Inline rendering takes precedence.
- Custom UI: `options.customComponents` supplies render slots; React's separate
  `components` prop replaces named internals. Follow the installed callback types.
  Slot callbacks receive `react` for rendering with the widget's React instance.
- Unread replies: the launcher shows a dot for sessions with a reply the visitor
  has not opened; `unreadIndicator` switches to `'count'` or `false`. Host pages
  badge their own UI with `hooks.onUnreadCountChange`; the `widgetTrigger` slot
  receives `unreadCount`. The backend keeps the read state, per visitor.
- Identity: distinguish the organization widget `token` from `user.token` for
  visitor authentication. Follow the [authentication guide](https://docs.open.cx/widget/authentication)
  for the selected version; use the application's server for signing credentials.
  A plain `user.data` object is not a signed identity token.

## v5 context and features

An omitted or false `streaming` keeps polling, including with v2 agents and
verified users. Set `streaming: true` only for requested live features supported
by the organization. Live replies use SSE; polling still reconciles persisted
history and human replies. Layout, agent version and delivery are independent:
Companion does not turn on streaming or page access, and the popover can use the
same supported live features.

Page reading requires `features.pageContext: true`; pointing additionally needs
`features.clientTools: true`; clicks, typing and selections additionally need
`features.pageActions: true`. All three page flags default off and require
organization permission. Pointing and actions also require streaming and a
compatible renderer. The stock UI asks the visitor to approve every page action.
Headless clients must implement page effects and consent before advertising that
capability. No client flag can enable an organization-disabled feature.

`features.dictation` and `features.attachments` can narrow the organization's
dictation and attachment settings; `false` turns them off in this embed. There is
no `enablePageMarks` option. `initialQuestions`
works with polling; `requireInitialQuestion: true` requires a selection before
typing when usable starters exist. Companion places starters above the composer.

Host-supplied context can enter session history and the agent's input. If the
customer wants to share page information, use a callback and an allowlist of
public routes and labels. This example omits private routes, URL query strings,
fragments and dynamic document titles:

```ts
const publicPageTitles: Record<string, string> = {
  '/help': 'Help center',
  '/pricing': 'Pricing',
};

const options = {
  token: 'WIDGET_TOKEN',
  displayMode: 'companion' as const,
  context: () => {
    const { origin, pathname } = window.location;
    const title = publicPageTitles[pathname];
    return title ? { page: { url: origin + pathname, title } } : {};
  },
};
```

Host `context` is sent on both engines even if `features.pageContext` is false;
that flag gates widget-collected page context and related affordances. Mark
sensitive page regions with `data-opencx-private` to exclude them from automatic
collection; it cannot sanitize data explicitly supplied through `context`. In v5,
the entity pill follows URL changes. When context changes without navigation,
dispatch `window.dispatchEvent(new Event('opencx:context-changed'))` so the pill
refreshes too. In React, keep changing values behind a ref or store that the
context function reads: do not assume replacing `options.context` updates every
initialized core context. Do not reinitialize on every route change.

## Personal connections and approval forms (v5)

These are optional capabilities, not prerequisites for installing v5. They need
compatible backend support and a server enabled for per-user access in the
customer's OpenCX dashboard. The stock widget renders the connection and approval
UI. Set `streaming: true` and `capabilities: { connections: true }` explicitly;
omitting either keeps personal connections off. The organization must support
streaming, and the visitor needs the signed access scope described below.

Use the [authentication guide](https://docs.open.cx/widget/authentication) to have
the customer's authenticated backend obtain a short-lived widget user token.
Return only that token to the browser and pass it as `user.token`; never expose the
organization API key or provider credentials. User data and `externalId` alone do
not authorize personal connections.

The backend authentication request can include `mcp_access`:

- Omit `mcp_access` to keep chat-only authentication without personal connections.
- Explicit `mcp_access: {}` with no `server_ids` allows all enabled per-user servers
  in that organization, including servers enabled later.
- An explicit list restricts access to those enabled servers; `[]` allows none.
- Include `mcp_access.account_id` when a user can switch accounts or workspaces.
  Resolve both the account and allowed servers from trusted backend state.

Tokens issued with explicit `mcp_access` expire after one hour. Renew these through
the customer's backend before expiry and when returning to a suspended tab, then
update `user.token`. Chat-only tokens issued without `mcp_access` keep their
existing non-expiring behavior; upgrading the widget does not require adding a
renewal loop for them. Renewal preserves the session when the signed owner,
account and normalized server-ID list stay the same. Changing user, account,
organization or that list resets active state. Claim representation alone does
not guarantee a reset: omitting `mcp_access` and using
`mcp_access: { server_ids: [] }` are equivalent when `account_id` is absent and
the other identity inputs are unchanged. Server-ID order is ignored. This is
client lifecycle handling; the backend still enforces access. Keep the provider
mounted when replacing a token; do not key it by the token string. Personal
grants persist across sessions for the same owner.

When a tool needs access, **Connect** opens authorization and the widget resumes
after success. Check popup blocking, cancellation, failure, and return-to-widget
behavior. `capabilities.connections: false` hides connection controls; it is not
an authorization boundary. Enforce restrictions with backend authentication.

Form elicitation lets a service request structured input during a tool call. It
is separate from OAuth consent and action approval policies. The stock UI validates
required fields and selection limits and offers Submit, Decline, and Cancel.
Simple approval forms can offer **Approve once** and **Always allow**. A saved
approval matches the same account, server, tool, inputs, and form; it is not a
blanket approval for every tool. Requests currently expire after 50 seconds and
cancel without approval. Do not collect credentials through forms.

From the session list, **Connections** shows services the user connected personally.
Select a service to remove an individual saved approval or disconnect it. Removing
an approval restores prompts without disconnecting; disconnecting also removes
saved approvals. Shared administrator connections are not user-managed here.

For a custom headless UI, use published exports and installed declarations:
`useAgentChatUi`, `ConnectionRequest`, and `useConnection` cover live turns and the
active connection request. Do not assume a public `useElicitation` hook exists.
Inspect the published core API declarations for elicitation list/response and
approval preference operations; implement their waiting, validation, cancellation,
expiry, and identity boundaries or use the stock React UI. Never import internal
monorepo components to fill a missing public export.

Backend token reuse is a separate, optional integration described in the
[authentication guide](https://docs.open.cx/widget/authentication). It requires an
explicit server opt-in and a server-only API key. A signed `connection.ready`
webhook carries identifiers, not credentials; the customer's backend retrieves
the current access token through the documented endpoint. Refresh tokens and
client secrets are not exported. A customer-managed gateway is another path; do
not promise arbitrary ready-credential import during user authentication.

## Verify the integration

Run the host application's build/type checks. In a browser, verify opening,
sending and receiving a message, history after reload, and the configured layout.
For v5, exercise streaming/stop if enabled and navigate before sending to confirm
current context. If personal access is enabled, also verify token renewal,
account switching, Connect return/cancel/blocked-popup behavior, a fresh session,
and disconnect. Test form submission, invalid selections, decline/cancel, expiry,
and removal of a saved approval. Check failed script/module requests and `[opencx]` console errors
when initialization fails. Report which checks required a real widget token and
which were actually completed.

Use [installation](https://docs.open.cx/widget/install-widget),
[configuration](https://docs.open.cx/widget/configuration), and the installed
package declarations for details. The public docs target stable v5; resolve any
differences against the customer's selected version.
