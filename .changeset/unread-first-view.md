---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

The unread dot lights again. The widget now tells the backend the first time the visitor looks at a session, even when nothing in it is unread, so later replies in that session show the dot. A session the visitor just started joins the sessions list right away, so it is tracked even if the widget is closed before the next refresh.
