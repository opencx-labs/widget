---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Let the agent click, type and choose on the page for the visitor, when the organization turns it on.

Every page action asks for visitor confirmation, naming the control and showing the proposed value when filling a field or choosing an option. Declining or revoking page access prevents the action. This applies regardless of the page's language, including fields that auto-save. Password fields, file pickers, controls inside another site embedded in the page and regions marked `data-opencx-private` are never touched. Replies report observed browser changes; they do not prove a remote business transaction completed.
