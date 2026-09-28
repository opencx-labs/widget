---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Separate page actions from pointing with an explicit `features.pageActions` opt-in
and the backend's `page_actions` permission. Existing beta action integrations
must set all three page options (`pageContext`, `clientTools`, `pageActions`).
Page access remains disabled by default for existing v4 integrations.

Cancel stale page effects, avoid replaying completed calls, retire old control
references without aliasing new controls, report reverted selections accurately,
and keep host exception text out of agent replies. Approved page clicks no longer
dismiss Companion. Contain malformed rich-reply normalization inside its error
boundary and recover when a valid revision arrives.
