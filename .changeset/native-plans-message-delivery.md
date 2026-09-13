---
"@opencx/widget-core": patch
"@opencx/widget-react-headless": patch
"@opencx/widget-react": patch
"@opencx/widget": patch
---

Show one tracked checklist per session above the message box, updating it in place across replies. Preserve plans when reply streaming is off, and show typing dots between complete assistant messages. Keep text streaming, tool activity, and reasoning visibility independently configurable.

Switching or starting a session immediately hides the previous session's plan and streamed reply while the selected session loads.
