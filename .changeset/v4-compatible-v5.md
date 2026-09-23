---
'@opencx/widget-core': patch
'@opencx/widget-react-headless': patch
'@opencx/widget-react': patch
'@opencx/widget': patch
---

Preserve existing v4 embed behavior when upgrading to v5: ship a self-contained script.js, keep polling unless streaming is explicitly enabled, and require capabilities.connections: true before making connection requests. Restore the deprecated deliveredAt user-message field and allow safe typography, color and spacing styles in configured footers while continuing to sanitize agent replies.

Existing beta integrations that use streaming or personal connections must explicitly set streaming: true and capabilities.connections: true.

Recognize the backend's widget-contact JWT envelope so renewing a token for the same contact preserves the active conversation; changing the contact or account still resets it.
