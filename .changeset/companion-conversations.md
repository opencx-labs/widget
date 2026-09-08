---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

Keep multiple conversations open in the v5 companion. Switch or close them in the compact title menu, or use the numbered session circles in the collapsed launcher. Each chat shows its own working state; circle names appear on hover and close controls appear on hover, keyboard focus, or touch.

Each conversation owns its send engine, text, mentions, and attachment uploads. Switching or collapsing the panel preserves that state and lets background responses finish. Closing a tab keeps its saved conversation in history, releases its runtime after an in-flight response finishes, and selects a remaining chat. A blank composer remains after the last tab closes.

The title menu and launcher share session visibility and commands. The existing `oneOpenSessionAllowed` setting also guards new-chat commands while another session is being created. With `router.restoreLastSession` enabled, reloading restores the selected saved conversation; background responses cannot overwrite that selection. The set of open tabs and unsent drafts stays in memory for the current widget mount.
