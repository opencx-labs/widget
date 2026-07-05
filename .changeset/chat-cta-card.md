---
'@opencx/widget-core': minor
'@opencx/widget-react': minor
'@opencx/widget': minor
---

Add a declarative Chat CTA card: `WidgetConfig.cta` renders a proactive
teaser near the launcher with a title, body, image, avatars, action buttons
(open-chat / ask / prefill / url), and an optional inline composer. Includes
dismiss persistence (`dismissForDays`), `showAfterSeconds` / `urlMatch` rules,
`onCtaDisplayed` / `onCtaClicked` / `onCtaDismissed` hooks, `cta/*`
cssOverrides component names, and `showCta()` / `hideCta()` on `WidgetRef`
and `window.opencxWidget`.
