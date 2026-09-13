# 001 — Animate the session plan

- **Status**: DONE
- **Starting commit**: d78a05b
- **Scope**: plan component, selector type, focused tests and changeset

## Intended behavior

Show one compact plan above the message box for each session. Match the legacy companion plan with a progress ring, a truncated current-step label, a completion count and an expandable checklist. Keep completed plans available to inspect.

The assistant supplies step state; the widget owns presentation. Preserve session isolation, live/saved plan identity, explicit clearing and the pinned location.

## Implementation

`packages/react/src/components/TaskPlan.tsx` uses a native disclosure button with a stable panel relationship and keyboard focus. The checklist opens over 200ms and closes over 150ms using existing motion tokens. Its chevron rotates 180 degrees; its progress ring updates in place. Rows remain stationary while their status icons crossfade over 150ms. The checklist retains its 240px maximum height and internal scrolling.

Reduced motion removes height travel, rotation and animated progress, retaining a brief opacity fade. A paused plan uses a static marker. No new dependency, per-turn plan, backend protocol or feature gate was introduced.

The existing `chat/session-plan` selector was added to the core selector union so production builds recognize its current caller.

## Verification — 14 September 2026

- 28 focused widget tests passed, covering plan disclosure/progress, reversal, pause, completed-plan retention, reduced motion, session ownership and delivery motion contracts.
- Scoped lint/format checks passed. The full four-package production build and its JSX guards passed.
- Live Payla preview at `http://localhost:5173/` displays one pinned plan with the compact header and checklist.
- Enter and Space both toggle the panel while focus stays on its button.
- Browser reduced-motion emulation confirmed one card, retained focus and automatic panel height. The emulation override was removed afterwards.
- Progress updates and rapid reversal are covered by component tests; no new model request was needed for the presentation change.

Related: [widget PR #62](https://github.com/opencx-labs/widget/pull/62).
