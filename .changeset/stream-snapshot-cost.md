---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Streamed replies no longer copy the whole message on every update. On slower runtimes such as React Native, long replies could pile up enough work per update to hit React's update limit and crash with "Maximum update depth exceeded".
