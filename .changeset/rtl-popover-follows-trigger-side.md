---
'@opencx/widget-react': patch
'@opencx/widget': patch
---

fix: open the chat box on the same side as the trigger button when `theme.widgetTrigger.offset` explicitly pins a side (e.g. `{ right: 20 }` on an RTL page). Previously the trigger honored the explicit offset while the popover anchor and alignment followed the host document direction, so the box opened on the opposite side.
