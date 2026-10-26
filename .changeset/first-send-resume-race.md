---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

With streaming on, the first message of a new conversation keeps its waiting state until the reply ends, and a reply that arrives as a separate message (for example a workflow's message with options) shows right after the turn instead of on the next poll.
