---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

Headless streaming runs in React Native. The streaming engine no longer crashes on mount where there is no `document`; `streamingFetch` sends and resumes streamed replies through a fetch that can stream (`expo/fetch`); `useAgentChatUi().resumeInterruptedTurn()` lets the app resume a dropped reply on its own foreground and reconnect signals; and the resume request no longer depends on `URLSearchParams.set`.
