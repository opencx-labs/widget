---
"@opencx/widget-core": patch
"@opencx/widget-react-headless": patch
"@opencx/widget-react": patch
"@opencx/widget": patch
---

Read the controls a visitor can see and send their names with each message, so the agent can answer where something is without the visitor marking it first.

Names only: what a field contains never leaves the browser, and password fields, file pickers, anything hidden from screen readers and the widget's own interface are skipped. A region marked `data-opencx-private` is excluded whole. Only pages that share page context read anything at all.
