---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

With streaming on, `lastAIResMightSolveUserIssue` is set again once an AI reply completes, so the "This was helpful" prompt shows and headless shells can act on it. It resets when the visitor sends; a stopped, failed or superseded reply leaves it `false`.
