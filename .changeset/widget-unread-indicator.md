---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

The launcher shows a red dot when a session holds a reply the visitor has not looked at yet, and the sessions list marks which ones. Looking at the session clears it; opening the widget onto the list does not. The read state lives on the backend, so it follows the visitor across devices. `unreadIndicator: 'count'` shows the number of such sessions instead, `false` hides the built-in marks. `hooks.onUnreadCountChange` reports the count to the host page, and `customComponents.widgetTrigger` receives it as `unreadCount`.
