---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Require explicit pageContext opt-in for page collection and both pageContext/clientTools opt-in for agent actions, including request feature flags. Preserve host-supplied context behavior. Filter private/hidden regions and field contents from collected names and marks; omit captures containing sensitive regions or fields. Strip credentials/query/fragment from collected page URLs. Upload mark screenshots only after Send and recheck privacy before upload. Recheck page access around asynchronous agent actions and responses.
