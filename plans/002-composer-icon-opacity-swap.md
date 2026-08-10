# 002 — Composer icon swaps: opacity-only crossfade (drop the translate)

- **Status**: TODO
- **Commit**: 3dbe64a
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, ~5 one-word prop additions

## Problem

The composer's send button and attach button swap their icon through `MotionDiv`,
whose default entrance is `fadeIn='down'` with a **10px vertical translate**
(`components/lib/MotionDiv.tsx:21` → `ANIMATION_DISTANCE_PX = 10`; the `down`
variant sets `initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }`).

The send button toggles between three icons on **every message** — send →
stop/loading (while awaiting the reply) → send again — so a visitor who sends ten
messages sees the icon drop in from `y:-10` roughly twenty times. AUDIT §1: an
action seen tens of times a day should have **reduced** motion; a positional
drop-in is more motion than an icon state-swap earns. The purpose here is *state
indication*, which a quick opacity crossfade communicates cleanly — the vertical
travel adds nothing but busyness at high frequency.

Current send/stop/loading swap (`screens/chat/ChatFooter.tsx:400-414`):

```tsx
<AnimatePresence mode="wait">
  {streamingTurn.active ? (
    <MotionDiv key="stop" snapExit>
      <SquareIcon className="size-3 fill-current" />
    </MotionDiv>
  ) : shouldBlockSending || isUploading ? (
    <MotionDiv key="loading" snapExit>
      <CircleDashed className="size-4 animate-spin animate-iteration-infinite" />
    </MotionDiv>
  ) : (
    <MotionDiv key="send" snapExit>
      <ArrowUpIcon className="size-4" />
    </MotionDiv>
  )}
</AnimatePresence>
```

Current attach (paperclip) swap (`screens/chat/ChatFooter.tsx:368-378`):

```tsx
<AnimatePresence mode="wait">
  {!shouldBlockSending ? (
    <MotionDiv key="paper-clip">
      <PaperclipIcon className="size-4" />
    </MotionDiv>
  ) : (
    <MotionDiv key="paper-clip-disabled">
      <PaperclipIcon className="size-4 opacity-50" />
    </MotionDiv>
  )}
</AnimatePresence>
```

## Target

Keep the crossfade, kill the translate, by passing `distance={0}` to each icon
`MotionDiv`. `MotionDiv` already threads `distance` into every variant
(`components/lib/MotionDiv.tsx:76-77`, `fadeIn = 'down'`, `distance =
ANIMATION_DISTANCE_PX`), so `distance={0}` yields `initial: { opacity: 0, y: 0 }`,
`animate: { opacity: 1, y: 0 }` — a pure opacity crossfade with **no** new API,
no structural change, and `snapExit` still giving an instant exit under
`mode="wait"`.

```tsx
// screens/chat/ChatFooter.tsx:400-414 — target
<AnimatePresence mode="wait">
  {streamingTurn.active ? (
    <MotionDiv key="stop" snapExit distance={0}>
      <SquareIcon className="size-3 fill-current" />
    </MotionDiv>
  ) : shouldBlockSending || isUploading ? (
    <MotionDiv key="loading" snapExit distance={0}>
      <CircleDashed className="size-4 animate-spin animate-iteration-infinite" />
    </MotionDiv>
  ) : (
    <MotionDiv key="send" snapExit distance={0}>
      <ArrowUpIcon className="size-4" />
    </MotionDiv>
  )}
</AnimatePresence>
```

```tsx
// screens/chat/ChatFooter.tsx:368-378 — target
<AnimatePresence mode="wait">
  {!shouldBlockSending ? (
    <MotionDiv key="paper-clip" distance={0}>
      <PaperclipIcon className="size-4" />
    </MotionDiv>
  ) : (
    <MotionDiv key="paper-clip-disabled" distance={0}>
      <PaperclipIcon className="size-4 opacity-50" />
    </MotionDiv>
  )}
</AnimatePresence>
```

## Repo conventions to follow

- `MotionDiv` is the shared entrance primitive (`components/lib/MotionDiv.tsx`);
  it is configured via its own props (`fadeIn`, `distance`, `snapExit`), not by
  hand-writing `initial/animate/exit`. Use the `distance` prop — do not inline a
  variant object.
- `snapExit` is already the established way these icons make their exit instant
  under `AnimatePresence mode="wait"` — keep it.

## Steps

1. In `screens/chat/ChatFooter.tsx`, add `distance={0}` to the three send-row
   `MotionDiv`s: `key="stop"` (line 402), `key="loading"` (line 406),
   `key="send"` (line 410).
2. In the same file, add `distance={0}` to the two attach-row `MotionDiv`s:
   `key="paper-clip"` (line 370), `key="paper-clip-disabled"` (line 374).
3. Change nothing else — no easing, no duration, no structure.

## Boundaries

- Do NOT modify `components/lib/MotionDiv.tsx` itself (changing the shared
  default distance would affect message reveals and every other consumer — out
  of scope for this plan).
- Do NOT touch the file-attachment thumbnails' `MotionDiv` (`key={file.id}`,
  `ChatFooter.tsx:314`) — those genuinely enter/leave the layout and the small
  motion reads as appropriate there.
- Do NOT change `mode="wait"` or `snapExit`.
- If the icon `MotionDiv`s no longer match the excerpts (drift since commit
  `3dbe64a`), STOP and report.

## Verification

- **Mechanical**: from `packages/react`, run `pnpm type-check` — no new errors
  (only the pre-existing `src/companion/app-frame.ts` `NodeList` errors remain).
- **Feel check**: run `examples/react-19`, open the widget, and send a message:
  - The send arrow should **crossfade** into the stop/loading icon and back with
    **no vertical hop** — icon centered the whole time.
  - In DevTools → Animations panel, set playback to 10% and confirm the icon only
    changes opacity, never `translateY`.
  - Spam-send several messages quickly and confirm the swap never looks jumpy.
- **Done when**: the send/attach icon transitions are pure opacity crossfades
  with the glyph staying vertically centered throughout.
