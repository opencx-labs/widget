# 003 — Give the AI `highlight_element` spotlight a focus-lock entrance, echo pulse, and label rise

- **Status**: TODO
- **Commit**: bb11470
- **Severity**: MEDIUM
- **Category**: Missed opportunities (+ Accessibility for the reduced-motion gate)
- **Estimated scope**: 1 file (`packages/react/src/element-picker/agent-highlight.ts`), ~40 lines changed/added; 1 spec file may need a trivial guard-compatible assertion (see Verification)

## Problem

When the AI calls the `highlight_element` tool, the widget spotlights an element
on the host page. This is a **rare, AI-initiated, high-attention moment** — the
assistant is literally pointing at something on the user's screen — so it has
delight budget. Today it's a flat opacity fade:

```ts
// packages/react/src/element-picker/agent-highlight.ts:50-62 — current
Object.assign(spotlight.style, {
  position: 'fixed',
  zIndex: '2147483646',
  borderRadius: '10px',
  pointerEvents: 'none',
  // White halo → brand ring → huge outer shadow that dims everything
  // around the element (single-node spotlight).
  boxShadow: `0 0 0 2px rgba(255, 255, 255, 0.95), 0 0 0 3.5px ${accentColor}, 0 0 0 100vmax rgba(0, 0, 0, 0.32)`,
  opacity: '0',
  transitionProperty: 'opacity',
  transitionDuration: '250ms',
  transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
} satisfies Partial<CSSStyleDeclaration>);
```

```ts
// packages/react/src/element-picker/agent-highlight.ts:114-118 — current
  track();
  // Fade in after the first position is set.
  requestAnimationFrame(() => {
    spotlight.style.opacity = '1';
  });
```

Specific gaps:

1. **No spatial entrance.** The frame just fades in place — nothing communicates
   "locking onto this element". A frame that settles inward from slightly larger
   (`scale(1.035)` → `1`) reads as a camera focusing; pure fade reads as a tooltip.
2. **No attention beat.** The ring appears once and then sits static for 6
   seconds. On a busy page the user's eye may not land on it, even with the dim.
   One or two soft echo ripples right after settle is the canonical "look here"
   cue, and it costs nothing on the compositor.
3. **The label pops.** `input.label` (agent-highlight.ts:65-101) is appended as a
   child of the spotlight and inherits the parent fade exactly — it materializes
   at full layout position with zero motion of its own, at the same instant as
   the ring, so the two read as one flat sticker instead of a frame + a caption.
4. **No `prefers-reduced-motion` handling** in this file, and
   `el.scrollIntoView({ behavior: 'smooth', … })` (agent-highlight.ts:42) always
   smooth-scrolls — for reduced-motion users that page-level scroll animation is
   the single most nauseating part of the whole effect. Note: plan 001's
   `<MotionConfig reducedMotion="user">` does NOT cover this file — the spotlight
   is raw DOM appended to the **host page** (`document.documentElement`), outside
   Framer Motion and outside the widget iframe. It needs its own `matchMedia`
   gate regardless of 001.

## Target

Choreography (all transform/opacity, compositor-only; the existing rAF loop that
tracks `left/top/width/height` is position *tracking*, not animation — leave it):

- **Entrance (focus-lock)**: opacity `0 → 1` and `transform: scale(1.035) → scale(1)`,
  `300ms cubic-bezier(0.23, 1, 0.32, 1)`, default `transform-origin` (center is
  correct — this is in-place emphasis, not a trigger-anchored popover).
- **Echo pulse**: a dedicated child node ringed with the accent, animated via
  WAAPI: `scale(1) → scale(1.04)` with `opacity 0.5 → 0`, duration `900ms`,
  delay `400ms` (starts after the entrance settles), `iterations: 2`,
  easing `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Label rise**: WAAPI on the label: `opacity 0 → 1`, `translateY(5px) → 0`,
  `200ms`, delay `150ms`, `fill: 'backwards'` (so it's hidden during the delay),
  easing `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Exit**: keep the retargetable CSS opacity transition (interruptible — a
  click mid-entrance must reverse from the current frame, which transitions give
  us for free). Add a subtle release: `transform: scale(1.015)` on dismiss,
  motion-gated.
- **Reduced motion** (`window.matchMedia('(prefers-reduced-motion: reduce)').matches`):
  keep both opacity fades (comprehension feedback stays), drop the scale
  entrance, the pulse, the label translate, and the exit scale; use
  `scrollIntoView({ behavior: 'auto', … })`.

## Repo conventions to follow

- This file already uses the repo's strong ease-out everywhere:
  `cubic-bezier(0.23, 1, 0.32, 1)` (agent-highlight.ts:61). Use it for every new
  animation. Do not introduce a different curve.
- Inline styles with `satisfies Partial<CSSStyleDeclaration>` — this is
  host-page DOM that can't reach the widget's iframe-scoped stylesheet
  (see the header comment in
  `packages/react/src/element-picker/ElementPickerOverlay.tsx:16-20`). Keep new
  style objects in the same pattern.
- Reduced-motion gating precedent for the picker surface:
  `ElementPickerOverlay.tsx:47-50` disables its keyframe animations under
  `@media (prefers-reduced-motion: reduce)`. This file is imperative DOM, so use
  `window.matchMedia(...)` instead of a media query block.
- The pulse ring color is the caller-provided `accentColor` (the widget theme's
  `primaryColor`) — same as the existing ring. No hardcoded accents.

## Steps

All edits in `packages/react/src/element-picker/agent-highlight.ts` unless noted.

1. At the top of `highlightElementOnHostPage`, after the `resolveElementByHint`
   guard, read the motion preference once:

   ```ts
   const reduceMotion =
     typeof window.matchMedia === 'function' &&
     window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   ```

2. Change the scroll (line 42) to respect it:

   ```ts
   el.scrollIntoView({
     behavior: reduceMotion ? 'auto' : 'smooth',
     block: 'center',
     inline: 'nearest',
   });
   ```

3. Entrance. In the `spotlight` style object, extend the transition to cover
   transform and set the pre-entrance transform:

   ```ts
   opacity: '0',
   transform: reduceMotion ? 'none' : 'scale(1.035)',
   transitionProperty: 'opacity, transform',
   transitionDuration: '300ms',
   transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
   ```

   And in the existing "fade in after first position" rAF callback
   (currently lines 116-118), settle both properties:

   ```ts
   requestAnimationFrame(() => {
     spotlight.style.opacity = '1';
     spotlight.style.transform = 'scale(1)';
   });
   ```

4. Echo pulse. After the label block (after line 101), create the pulse node as
   a child of `spotlight` and animate it with WAAPI, guarded for environments
   without `Element.animate` (JSDOM in the existing spec):

   ```ts
   if (!reduceMotion) {
     const pulse = document.createElement('div');
     Object.assign(pulse.style, {
       position: 'absolute',
       inset: '0',
       borderRadius: '10px',
       boxShadow: `0 0 0 2.5px ${accentColor}`,
       opacity: '0',
       pointerEvents: 'none',
     } satisfies Partial<CSSStyleDeclaration>);
     spotlight.appendChild(pulse);
     if (typeof pulse.animate === 'function') {
       pulse.animate(
         [
           { transform: 'scale(1)', opacity: 0.5 },
           { transform: 'scale(1.04)', opacity: 0 },
         ],
         {
           duration: 900,
           delay: 400,
           iterations: 2,
           easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
         },
       );
     }
   }
   ```

   No cleanup bookkeeping needed: the animation is finite and the node is
   removed with `container` on dismiss.

5. Label rise. Immediately after `spotlight.appendChild(label)` (line 100), add
   the same-guarded WAAPI entrance:

   ```ts
   if (!reduceMotion && typeof label.animate === 'function') {
     label.animate(
       [
         { opacity: 0, transform: 'translateY(5px)' },
         { opacity: 1, transform: 'translateY(0)' },
       ],
       {
         duration: 200,
         delay: 150,
         fill: 'backwards',
         easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
       },
     );
   }
   ```

6. Exit release. In `dismiss()` (currently lines 121-130), next to
   `spotlight.style.opacity = '0'`:

   ```ts
   spotlight.style.opacity = '0';
   if (!reduceMotion) spotlight.style.transform = 'scale(1.015)';
   ```

   Leave the `window.setTimeout(() => container.remove(), 300)` as is — it
   already outlasts the 300ms transition.

## Boundaries

- Do NOT touch `ElementPickerOverlay.tsx`, `useElementPicker.ts`,
  `element-info.ts`, `useAgentChat.ts`, or anything in the backend repo.
- Do NOT change the spotlight's dual-ring/dim visual identity (the
  `boxShadow` stack), the 6000ms duration, the dismiss triggers, or the
  rAF geometry tracking.
- Do NOT add dependencies (no Framer Motion here — this is host-page DOM;
  CSS transitions + WAAPI only).
- Do NOT inject `<style>`/`@keyframes` into the host page — inline styles and
  WAAPI keep the host document clean.
- If the code at the cited lines doesn't match (drift since commit `bb11470`),
  STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `cd packages/react && pnpm exec tsc --noEmit` → no errors.
  - `cd packages/react && pnpm vitest run src/element-picker` → all pass. The
    existing `__tests__/agent-highlight.spec.ts` runs in JSDOM where
    `Element.animate` is undefined — the `typeof …animate === 'function'`
    guards in steps 4-5 must keep it green without mocking WAAPI.
  - Optionally extend the spec: stub `window.matchMedia` to return
    `{ matches: true }` and assert `scrollIntoView` was called with
    `behavior: 'auto'`; with `{ matches: false }` assert `'smooth'`.
- **Feel check** (run the dashboard test-widget flow: pick an element, send
  "highlight it", watch the spotlight):
  - The frame visibly settles *inward* onto the element — it should feel like
    focus locking, not a fade-in sticker. In DevTools → Animations panel at 10%
    speed, confirm the frame starts slightly larger than its final size and
    that opacity and scale finish together.
  - After the frame settles, exactly two soft accent ripples expand and die;
    they must be subtle (peak opacity 0.5) and must not read as an alarm.
  - The label rises in ~150ms after the ring starts, from 5px below its resting
    spot — never pops.
  - Click mid-entrance: the spotlight reverses smoothly from wherever it is
    (no restart-from-zero, no flash).
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, trigger
    again: page scroll jumps instantly, frame and label fade in with **no**
    scale/translate, no ripples — but the fades still happen.
- **Done when**: all mechanical checks pass and every feel-check bullet is
  confirmed by eye at both normal and 10% playback speed.
