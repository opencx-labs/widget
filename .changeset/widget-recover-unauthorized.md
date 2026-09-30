---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Recover when the backend stops accepting the stored visitor token mid-session. The widget mints a fresh anonymous identity, drops the dead session and reloads history instead of failing every send until the page is reloaded. Host-provided user tokens are left to the host to renew.
