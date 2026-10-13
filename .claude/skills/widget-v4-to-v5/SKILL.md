---
name: widget-v4-to-v5
description: Migrate an OpenCX widget integration from v4 or a v5 beta to stable v5. Use for package upgrades, custom-renderer compatibility, self-hosted embeds, and adoption of Companion or streaming.
---

# Migrate the OpenCX widget to stable v5

Read [the public migration skill](../../../skills/opencx-widget-migration/SKILL.md)
for the maintained installation commands, compatibility boundaries, defaults,
identity handling, and verification steps. Its examples currently pin 5.4.1;
preserve the requested target and verify the published version before changing it.
Use that guide instead of keeping a second copy of the migration contract here.

For work inside this repository, also read
[the contributor skill](../opencx-widget/SKILL.md). For a customer application,
use published packages and exports rather than monorepo source paths.

## OpenCX dashboard and other internal consumers

- Preserve `HostedSpecRenderer`, `segmentContent`, and `ContentSegment` imports
  from `@opencx/widget-react`; the dashboard uses them outside the widget shell.
- Update matching widget packages together and inspect the consumer lockfile.
- Custom headless shells need live-turn rendering through `useAgentChatUi`,
  unread viewing lifecycle where supported, and the completed-reply feedback
  flag. Do not infer that persisted message state represents a whole live turn.
- Validate the consumer's production build and actual rendered widget, including
  package JSX-runtime compatibility. A dev-server mount is insufficient.

Stable v5 uses a self-contained `dist-embed/script.js`, keeps `deliveredAt` as a
compatibility alias, and requires explicit opt-in for streaming, personal
connections, and page permissions. Treat earlier split-loader and beta-default
instructions as version-specific history, not the stable migration procedure.
