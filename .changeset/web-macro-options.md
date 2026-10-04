---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

Agent messages sent from a macro with options show the options as buttons under the message. Tapping one sends its label as the visitor's reply; afterwards only the picked option stays, with a check. Only the newest unpicked options message of an open session shows its options. `SendMessageInput.optionReply` sends a tap from a custom UI, and `WidgetAgentMessage.messageOptions` carries the options.
