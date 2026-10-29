---
'@opencx/widget-core': minor
'@opencx/widget-react-headless': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

Label the CSAT feedback box and replace its arrow with a text submit button.
Both read new translation keys, `csat_feedback_label` and `csat_submit`, so
embedders can reword them through `translationOverrides`. The survey's parts
carry stable `data-component` hooks (`chat/csat/root`, `chat/csat/feedback_label`,
`chat/csat/feedback`, `chat/csat/submit`) for `cssOverrides`.
