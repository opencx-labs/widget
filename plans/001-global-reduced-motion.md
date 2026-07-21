# 001 — Respect `prefers-reduced-motion` across the whole widget

- **Status**: TODO
- **Commit**: 3dbe64a
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 1 file, ~2 lines

## Problem

Framer Motion animations in the widget move regardless of the visitor's OS
"Reduce motion" setting. `useReducedMotion()` is called in only three files —
all companion-specific:

- `packages/react/src/companion/WidgetCompanion.tsx:130`
- `packages/react/src/companion/CompanionFaceIcon.tsx:30`
- `packages/react/src/companion/WidgetSidebar.tsx:103`

There is **no** `<MotionConfig reducedMotion="user">` anywhere (verified: `grep -rn
"MotionConfig\|reducedMotion" packages/react/src` returns nothing outside those
three `useReducedMotion` calls). So the entire chat surface — every `MotionDiv`
fade-in-down, every `MotionDiv__VerticalReveal` reveal, and all `AnimatePresence`
transitions in `screens/chat/*`, `ChatFooter.tsx`, `ChatFooterItems.tsx`,
`UserMessage.tsx`, etc. — plays position/scale motion for users who explicitly
asked the OS for less.

A visitor with vestibular sensitivity gets the full translate-and-scale
choreography on every message. This is the single highest-leverage motion fix in
the package: one context provider covers everything.

Current root (`packages/react/src/index.tsx:115-131`):

```tsx
const Widget = React.forwardRef<
  WidgetRef,
  {
    options: WidgetConfig;
    components?: WidgetComponentType[];
    loadingComponent?: React.ReactNode;
  }
>(function Widget({ options, components = [], loadingComponent }, ref) {
  return (
    <WidgetProvider
      components={[...defaultComponents, ...components]}
      options={options}
      storage={storage}
      loadingComponent={loadingComponent}
    >
      <WidgetTriggerProvider>
        <WidgetLayoutProvider>
          <WidgetImperativeHandler widgetRef={ref} />
          {options.inline ? <WidgetContent /> : <WidgetDisplayRoot />}
        </WidgetLayoutProvider>
      </WidgetTriggerProvider>
    </WidgetProvider>
  );
});
```

## Target

Wrap the whole tree in `MotionConfig` with `reducedMotion="user"`. This is React
context, so it reaches every descendant `motion.*` element regardless of the
iframe/shadow-root portals the widget renders into. With `"user"`, Framer
automatically **snaps `transform`/`x`/`y`/`scale`/layout animations while keeping
`opacity` and color transitions** — exactly the AUDIT §6 rule ("fewer and
gentler, not zero"). It does **not** touch non-transform animated values
(`width`/`height`/`borderRadius`), so the companion shell morph and its existing
manual `shouldReduceMotion` branch keep working unchanged — this fix is purely
additive.

```tsx
// packages/react/src/index.tsx — target
import { MotionConfig } from 'framer-motion';
// ...
  return (
    <MotionConfig reducedMotion="user">
      <WidgetProvider
        components={[...defaultComponents, ...components]}
        options={options}
        storage={storage}
        loadingComponent={loadingComponent}
      >
        <WidgetTriggerProvider>
          <WidgetLayoutProvider>
            <WidgetImperativeHandler widgetRef={ref} />
            {options.inline ? <WidgetContent /> : <WidgetDisplayRoot />}
          </WidgetLayoutProvider>
        </WidgetTriggerProvider>
      </WidgetProvider>
    </MotionConfig>
  );
```

## Repo conventions to follow

- Framer Motion is already the motion library and is imported as
  `framer-motion` (e.g. `import { AnimatePresence } from 'framer-motion'` in
  `packages/react/src/screens/chat/ChatFooter.tsx:13`, and
  `import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion'`
  in `companion/WidgetCompanion.tsx:1-6`). Add `MotionConfig` to a
  `framer-motion` import — do **not** add a new dependency.
- `MotionConfig` belongs at the outermost render position of the `Widget`
  component so it is an ancestor of both the popover and companion trees.

## Steps

1. In `packages/react/src/index.tsx`, add `MotionConfig` to the existing
   React/framer imports (there is currently no `framer-motion` import in this
   file, so add `import { MotionConfig } from 'framer-motion';` near the top with
   the other imports, after line 2).
2. In the `Widget` `forwardRef` render (starts line 116), wrap the returned
   `<WidgetProvider>…</WidgetProvider>` in
   `<MotionConfig reducedMotion="user">…</MotionConfig>` as shown in Target.
   Change nothing else inside the tree.

## Boundaries

- Do NOT remove or alter the existing `useReducedMotion()`/`shouldReduceMotion`
  branches in the three companion files — they handle the non-transform shell
  morph that `MotionConfig` does not cover. This plan is additive.
- Do NOT add a new dependency; `framer-motion` is already present.
- Do NOT change any markup other than the wrapper.
- If `index.tsx` no longer matches the excerpt above (drift since commit
  `3dbe64a`), STOP and report.

## Verification

- **Mechanical**: from `packages/react`, run `pnpm type-check` — it must still
  fail ONLY on the three pre-existing `src/companion/app-frame.ts` `NodeList`
  iteration errors (unrelated) and report no new errors in `index.tsx`.
- **Feel check**: run `examples/react-19` (add `displayMode: 'companion'` to the
  `options` to also cover the companion path) and, in Chrome DevTools →
  Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce":
  - Send a message and open/close the chat — message reveals and composer icon
    swaps should **fade** (opacity) with **no translate/scale movement**.
  - Turn the emulation OFF and repeat — the full fade-in-down motion returns.
  - Confirm content is never hidden or broken in either state (reduced motion
    keeps opacity, so nothing should stay at `opacity: 0`).
- **Done when**: with reduced-motion emulated, no widget element translates or
  scales on entrance, but all content still appears (via opacity) and remains
  legible; with it off, motion is unchanged from today.
