---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Retire a rating survey the moment it is withdrawn: the widget now reads the withdrawal event from the session, rolls back a rating the server refused instead of showing it as recorded, and exposes `isCsatCancelled` from `useCsat`.
