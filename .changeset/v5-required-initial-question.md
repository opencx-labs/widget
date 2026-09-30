---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Carry the v4.0.63 requireInitialQuestion option and question-container padding into v5. Keep the composer hidden until a first question is sent, preserve follow-ups for existing conversations, and require a new choice for new conversations. Apply the same requirement to Companion quick-ask. The option remains off by default and does not block the composer when no usable questions are configured.

In Companion quick-ask, show initial questions as floating pills above the composer on a transparent surface. Keep free typing available by default; hide it only when requireInitialQuestion is true. Render suggestions in a separate layer above the original animated composer, and hide them once a conversation has messages.
