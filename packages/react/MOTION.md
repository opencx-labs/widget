# Widget Motion & Keyboard Contract

The rules that keep the widget feeling like one system as it grows. The
deterministic layer is **enforced by
`src/__tests__/motion-contract.spec.ts`** — changing a value below is fine,
but do it deliberately: update the code, this file, and the test constants
in the same change. If a new animation fails the suite, the default
assumption is the animation is wrong, not the test.

## Motion tokens

All tokens live in [`src/motion.ts`](src/motion.ts); both shells consume them:

| Token             | Value                                 | Use                                                                     |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `EASE_OUT`        | `cubic-bezier(0.23, 1, 0.32, 1)`      | every tween — framer array form; CSS notation for keyframes             |
| `MORPH_SPRING`    | spring 500/45/1 (critically damped)   | the companion shell morph + popover open/close                          |
| `APP_FRAME_EASE`  | `cubic-bezier(0.32, 0.72, 0.24, 1)`   | sidebar app-frame inset only                                            |
| `FADE_TRANSITION` | 200ms `EASE_OUT`                      | the default for every `MotionDiv` enter                                 |
| `QUICK_TWEEN`     | 150ms `EASE_OUT`                      | exits (50ms snappier than the enter), reduced-motion morphs, pill settle |

## The rules

1. **One easing.** Tweens use `EASE_OUT`; shell morphs use `MORPH_SPRING`.
   CSS animations spell `EASE_OUT` as `cubic-bezier(0.23, 1, 0.32, 1)`.
   No stock `ease-in`/`ease-out` keywords, no new bezier without updating
   this table. (Exception: looping indicators may use `linear`/
   `ease-in-out` — a loop has no arrival to shape.)
2. **Duration bounds: 100–300ms** for one-shot animations. Micro-feedback
   (hover, color) at 100–150ms; structural motion (panel, screens) at
   180–300ms. Anything longer reads as sluggish; anything shorter as a
   glitch.
3. **Nothing loops** except indeterminate-progress indicators:
   `opencx-shimmer-text`, `opencx-stream-caret`, `ocx-text-shimmer`,
   Tailwind `animate-spin`. New loops require adding to the test allowlist —
   that friction is intentional.
4. **Paired motion mirrors.** An element's exit is its enter reversed —
   same duration (exits may run up to 50ms snappier), same easing.
   `MotionDiv` gives enter and exit `FADE_TRANSITION` by default.
   Known caveat: surfaces that must survive hidden-tab unmounts
   (the companion content iframe) deliberately skip exit animation —
   rAF never ticks in background tabs and an exiting clone would zombie.
5. **Content-changed signals need no exit pair.** A one-shot pulse on a
   persistent element (composer `opencx-input-recall`) enters nothing and
   removes nothing — it just narrates that the content swapped.
6. **Reduced motion is respected everywhere.** Framer honors it via
   `<MotionConfig reducedMotion="user">` at the root; every CSS animation
   class ships an `animation: none` override under
   `@media (prefers-reduced-motion: reduce)`.
7. **The shell morph is the same whatever moved it.** Escape, the × button
   and the layout picker all run `MORPH_SPRING` — one journey, one feel.
   Dismissing a panel is an occasional structural move (rule 2 puts those
   at 180–300ms), never micro-feedback; `QUICK_TWEEN` stands in only under
   reduced motion.

## CSS animation inventory

| Animation                     | Where            | Duration  | Notes                                                              |
| ----------------------------- | ---------------- | --------- | ------------------------------------------------------------------ |
| `opencx-text-shimmer`         | `index.css`      | 2.2s loop | thinking indicator (sanctioned loop)                               |
| `opencx-caret-blink`          | `index.css`      | 1s loop   | stream caret (sanctioned loop)                                     |
| `opencx-input-recall`         | `index.css`      | 150ms     | composer ↑/↓ history recall settle                                 |
| `ocx-text-shimmer`            | `StepsGroup.tsx` | 2.5s loop | step label shimmer (sanctioned loop)                               |
| `ocx-fade-up`                 | `StepsGroup.tsx` | 300ms     | step row entrance                                                  |
| `ocx-placeholder-in` / `-out` | `StepsGroup.tsx` | 200/180ms | collapsed current-step crossfade (exit snappier, sanctioned ±50ms) |

## Keyboard shortcuts

**[`src/utils/keybindings.ts`](src/utils/keybindings.ts) is the single
source of truth.** Every shortcut is a named action there; handlers match
events with `matchesBinding(e, WIDGET_KEYBINDINGS[action])` and buttons
advertise bindings with `formatBinding(...)` through `Tooltippy`'s
`shortcut` prop. Never hardcode a key check or a "⌘…" string in a
component — a rebind must move the handler and every hint together.

| Action                          | Binding                          | Scope                                 |
| ------------------------------- | -------------------------------- | ------------------------------------- |
| `close-panel`                   | `Escape`                         | dismiss, inside the widget iframe     |
| `toggle-fullscreen`             | `Mod+Shift+F`                    | companion chat panel only             |
| `send`                          | `Enter` (`Mod+Enter` also sends) | composer                              |
| `history-prev` / `history-next` | `↑` / `↓`                        | composer, caret at start/end          |

Rules for an **embedded** widget:

- `Mod` is ⌘ on Apple platforms and Ctrl elsewhere — never hardcode either.
- Chorded bindings are only listened for while the panel is open;
  single-key bindings only inside the widget's own iframe/composer. The
  host page's keyboard is not ours to shadow.
- Every listener is registered **twice** — host document and iframe
  document — because keystrokes inside the content iframe never reach the
  host (see `WidgetCompanion` ↔ `CompanionContent`). A shortcut wired on
  only one surface is a bug, not a smaller feature.
- A button that mirrors a shortcut advertises it: `Tooltippy shortcut=`
  with `formatBinding`. Current coverage: panel close (Esc), the
  fullscreen layout tile (⌘⇧F), the send button (⏎).
