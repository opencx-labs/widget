---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Stop polling for approval requests while the visitor is anonymous. Only signed-in users can hold personal connections, so the poll was refused on every attempt.
