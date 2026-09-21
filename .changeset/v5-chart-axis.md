---
'@opencx/widget-react': patch
---

Chart value labels are no longer clipped: the axis reserves room for the widest label it actually draws, so thousands and currency amounts read in full.
