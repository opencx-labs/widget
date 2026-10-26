---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

Options on messages sent by a workflow (which arrive as AI messages, `WidgetAiMessage.messageOptions`) now show as buttons too, like a teammate's macro. When a macro with options requires a tap, the composer is locked until the visitor taps one of its options. The lock lifts on the tap, when the session closes, or when a newer agent or AI message arrives. Options that do not require a tap leave the composer as it was. `WidgetMessageOptions.requireTap` carries the flag, and custom UIs can use `isAwaitingRequiredTap(messages, session)` and `tappableOptionsMessage(messages, session)` from `@opencx/widget-core` to apply the same rule.
