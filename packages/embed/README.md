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

Since v5 the embed is two files: `script.js` is a tiny classic loader that
injects `widget.js` as an ES module from the same directory, and `widget.js`
lazy-loads a few hashed chunks (the chart renderer, for one) from that
directory too. If you copy the build onto your own CDN:

- publish the WHOLE `dist-embed/` directory, not `script.js` alone;
- serve it with `Access-Control-Allow-Origin` (module scripts are fetched in
  CORS mode);
- keep the previous chunks around when you redeploy, or give `widget.js` a
  short cache TTL, so a cached `widget.js` never points at a chunk that no
  longer exists;
- under a nonce-based CSP, the loader copies the nonce from its own `<script>`
  tag onto the injected module tag.
