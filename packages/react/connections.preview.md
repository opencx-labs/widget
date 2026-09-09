# Connection preview

Run the React package dev server, then open `/connections.preview.html`. The demo opens Widget v5 in its companion sidebar layout.

- Shared account: the assistant uses the connection configured by the team.
- OTO: Connect opens consent immediately. Approve once; the widget resumes after the backend confirms access.
- Mollie: Connect opens the customer product. Returning or closing that page automatically asks the gateway to recheck access; it does not prove that setup succeeded.
- Cancelled approval allows another attempt. If the browser blocks popups, the same Connect action becomes a direct link; no new setup request is created.
- Connection setup appears inline when the assistant needs authorization. There is no Connections button in the header.
- Try a state switches between the normal flow, slow loading, a failed first attempt with retry, and expired access. Restart flow clears only this preview's account state.

The preview imports the production Widget, message components, ConnectionCard and useConnection hook. Buttons, progress indicators, spacing and colors use the widget's existing components and theme. Only customer services, authorization and sample responses are simulated; no real credentials are used. The preview controls and customer page sit outside the widget.

The companion OpenCX change documents identity, backend connection reuse and account isolation in `backend/src/mcp-servers/connections/README.md`.

## Real Linear account

Open `/connections.live.html` using `vite --config connections.live.config.ts`. This separate entry uses the real OpenCX backend and agent, with no simulated transport or replies. The local identity bridge reads `/private/tmp/opencx-linear-demo.json` server-side; create it with the OpenCX repository's `backend/scripts/seed-linear-connections-demo.ts`. Full setup and verification are in `backend/scripts/linear-connections-demo.md`.
