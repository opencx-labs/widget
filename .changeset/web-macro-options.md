---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

Agent messages sent from a macro with options show the options as buttons under the message. Tapping one sends its label as the visitor's reply and marks it as picked; only the newest unpicked options message of an open session can be tapped. `SendMessageInput.optionReply` sends a tap from a custom UI, and `WidgetAgentMessage.messageOptions` carries the options.
