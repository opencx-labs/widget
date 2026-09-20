---
"@opencx/widget-core": patch
"@opencx/widget-react-headless": patch
"@opencx/widget-react": patch
"@opencx/widget": patch
---

Report a page action as done only when the page really moved, and keep private regions out at the moment of acting.

A menu that opens by flipping one attribute now counts as something happening, a control inside a region marked private is refused even if it was read before the mark appeared, and the same is true for anything hidden from assistive technology.
