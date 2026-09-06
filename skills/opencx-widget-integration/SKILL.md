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

At verification on 2026-09-06, `latest` is `4.0.62` and `beta` is
`5.0.0-beta.0` for all four widget packages. Use the stable release for a normal
installation; use v5 beta when the user requests beta or v5 features. Do not add
v5-only options to a v4 installation. Re-check tags rather than assuming this
snapshot is still current. Installing this skill does not install the widget.

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
  src="https://unpkg.com/@opencx/widget@latest/dist-embed/script.js"
></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    window.initOpenScript({ token: 'WIDGET_TOKEN' });
  });
</script>
```

For a v5 beta integration, replace `@latest` with the selected exact beta version
or `@beta`. For inline HTML, provide `<div id="opencx-root"></div>` in the body and
set `inline: true`. Mount only one integration on a page; do not also mount React
`Widget` beside the script embed.

In v5, the classic loader installs `initOpenScript` synchronously, then loads
`widget.js` and a lazy chart chunk. Self-host the entire `dist-embed` directory at
a versioned URL. Keep old versions available for open tabs that load chunks later.
Cross-origin module hosting needs CORS. The loader copies its script tag's CSP
nonce to the injected module; the host's policy must also permit its initialization
code and any lazy module loads. Copying only `script.js` is insufficient.

## React installation

```bash
npm install @opencx/widget-react
```

Use `@opencx/widget-react@beta` instead for an explicitly selected v5 beta.
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
and the installed declarations. `WidgetProvider` wraps the custom UI; hooks such
as `useMessages` must run beneath it. The host owns the rendered UI and should
verify history, loading, errors, and persistence. In v5, a custom streaming UI
also uses `useAgentChatUi` for live items, stop, queued messages, and clarification.
`useMessages().messagesState` alone does not describe the whole live turn.

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
- Identity: distinguish the organization widget `token` from `user.token` for
  visitor authentication. Follow the [authentication guide](https://docs.open.cx/widget/authentication)
  for the selected version; use the application's server for signing credentials.
  A plain `user.data` object is not a signed identity token.

## v5 context and features

The organization decides whether streaming, dictation, attachments, page context,
and client tools are enabled. `features.dictation`, `features.pageContext`, and
`features.clientTools` can disable an enabled feature; `true` does not enable an
organization-disabled feature. There is no `enablePageMarks` option and no
`features.attachments` toggle. Companion layout does not itself enable streaming.

Use a context function that reads current application state at send time:

```ts
const options = {
  token: 'WIDGET_TOKEN',
  displayMode: 'companion' as const,
  context: () => ({
    page: { url: window.location.href, title: document.title },
  }),
};
```

Host `context` is sent on both engines even if `features.pageContext` is false;
that flag gates widget-collected page context and related affordances. In v5,
the entity pill follows URL changes. When context changes without navigation,
dispatch `window.dispatchEvent(new Event('opencx:context-changed'))` so the pill
refreshes too. In React, keep changing values behind a ref or store that the
context function reads: do not assume replacing `options.context` updates every
initialized core context in beta.0. Do not reinitialize on every route change.

## Verify the integration

Run the host application's build/type checks. In a browser, verify opening,
sending and receiving a message, history after reload, and the configured layout.
For v5, exercise streaming/stop if enabled and navigate before sending to confirm
current context. Check failed script/module requests and `[opencx]` console errors
when initialization fails. Report which checks required a real widget token and
which were actually completed.

Use [installation](https://docs.open.cx/widget/install-widget),
[configuration](https://docs.open.cx/widget/configuration), and the installed
package declarations for details. Public docs may describe stable v4 while the
customer runs v5 beta; resolve differences against the selected version.
