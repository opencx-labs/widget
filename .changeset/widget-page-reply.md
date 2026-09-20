---
"@opencx/widget-core": patch
"@opencx/widget-react-headless": patch
"@opencx/widget-react": patch
"@opencx/widget": patch
---

Tell the agent what actually happened on the page, while it is still answering.

The widget performs a page effect, looks at the result, and reports it back: drawn, covered by something else, or no longer there. The agent says what happened instead of hedging, and a page that never answers is reported as silence rather than as success.
