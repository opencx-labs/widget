# OpenCX Widget - Embed

The default React widget. Embeddable in HTML.

```html
<script src="https://unpkg.com/@opencx/widget@latest/dist-embed/script.js"></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    initOpenScript({ token: 'YOUR_WIDGET_TOKEN' });
  });
</script>
```

For all the available options, check [the documentation](https://docs.open.cx/widget/getting-started).

## Self-hosting

`dist-embed/script.js` is a self-contained classic script. Copy that single file
to your own server, as with v4. No sibling module or lazy chunks are required.
Apply your site's existing script CSP policy to the script tag.

Repeated script loads reuse the first loaded widget runtime and its React root.
Calling `initOpenScript` again updates its options. To switch widget versions,
reload the page.

## Opt into v5 runtime features

An unchanged configuration keeps classic send/poll delivery. To enable streaming
and personal service connections, declare both explicitly:

```js
initOpenScript({
  token: 'YOUR_WIDGET_TOKEN',
  streaming: true,
  capabilities: { connections: true },
});
```

Streaming also requires backend support. Companion layout is selected separately
with `displayMode: 'companion'`; changing layout alone does not change delivery.
