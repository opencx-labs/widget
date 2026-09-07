---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Declare support for selectable questions on each request. The built-in widget declares support automatically; headless clients and custom question components declare support with `capabilities.structuredQuestions` after implementing question rendering and answer submission.
