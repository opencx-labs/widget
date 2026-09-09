---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Translate the labels that were still hardcoded in English: the attachment and
send tooltips, the upload-failure message, the close-conversation confirmation,
the image zoom controls, the dialog close label, and the widget trigger and
panel accessibility labels. Translated strings can now carry `{placeholder}`
slots, so the attach tooltip shows the real upload limit in every language.
