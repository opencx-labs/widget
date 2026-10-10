---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

`unreadNotifications: { sound: true }` plays a short chime when a reply lands in a session the visitor is not looking at, at most once every few seconds. The chime is generated in the browser, so there is no file to load; pass a URL instead of `true` to play your own audio. Off unless the embed turns it on, and silent until the visitor has clicked or typed on the page. `hooks.onUnreadReply` fires for the same replies, so a host page can add its own title badge or notification. The widget now also reports a session as seen the first time the visitor opens it, which is what starts tracking unread replies on it.
