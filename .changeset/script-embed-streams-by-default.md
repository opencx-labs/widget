---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

The script embed now streams replies whenever your organization supports streaming, without `streaming: true` in `initOpenScript`. Set `streaming: false` to keep send-and-poll delivery. The React and headless packages are unchanged and still need `streaming: true`.
