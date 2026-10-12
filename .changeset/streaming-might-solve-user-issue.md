---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

With streaming on, `lastAIResMightSolveUserIssue` works again: it resets when the visitor sends and is set once the AI reply completes, from the verdict the stream now carries on its finish. The "This was helpful" / "I need more help" prompt shows again after such a reply, and headless shells can drive their own prompt or feedback request from it. A stopped, failed or superseded reply leaves it `false`.
