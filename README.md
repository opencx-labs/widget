# OpenCX Widget

For all the available options, check [the documentation](https://docs.open.cx/widget/getting-started)

## Page access in v5

Page reading and agent actions are off by default in both popover and Companion.
Enable them only on pages intended to be shared with the agent, with organization
support and explicit embed options:

```ts
features: { pageContext: true, clientTools: true }
```

Use only `pageContext: true` to allow reading/marking without agent actions.
Mark sensitive regions with `data-opencx-private`. Names and marked text exclude
private/hidden descendants and form values; screenshots are omitted for regions
containing private/hidden content, fields, or opaque embedded media. Mark previews
stay local until Send. Captured page URLs omit credentials, queries, and fragments;
URL paths and ordinary visible page text can still contain business data.

Host-provided `context`, message custom data, typed messages, and deliberately
attached files remain shared as configured. Page-access flags do not sanitize
those explicit inputs.
