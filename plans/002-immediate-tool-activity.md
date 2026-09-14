# 002 — Keep tool activity immediate during long tasks

- **Status**: TODO
- **Commit**: 3aadc86
- **Severity**: HIGH
- **Category**: Purpose & frequency / Interruptibility
- **Estimated scope**: 3 files, activity component, CSS, regression tests

## Problem

Repository: `/private/tmp/payla-a506-widget`.

`packages/react/src/components/StepsGroup.tsx:434` currently renders:

```tsx
{steps.map((step, index) => (
  <div
    key={index}
    className="opencx-fade-up"
    style={{ animationDelay: `${index * 40}ms` }}
  >
```

`packages/react/index.css:28` sets a 300ms animation with `both`, beginning at opacity zero. The 26th row therefore waits one second before its entrance. Reopening history replays the same stagger.

`StepsGroup.tsx:87` also delays the newest collapsed label:

```tsx
setPhase('out');
const tid = setTimeout(() => {
  setCurrent(latest);
  setPhase('in');
}, 180);
return () => clearTimeout(tid);
```

Arrivals less than 180ms apart repeatedly cancel the update while the old label fades away.

## Target

Live activity and history disclosure must show their latest information immediately, independent of step count. Do not stagger activity rows. Change the collapsed label immediately with **no positional animation and no exit timer**. Keep existing user-controlled expansion and automatic collapse only at the turn boundary.

Retain existing indicator behavior and any unrelated detail disclosure styling. If an opacity cue remains on an individual new row, its delay must be zero and duration **150ms** with `cubic-bezier(0.23, 1, 0.32, 1)`. Prefer no row entrance, because this is frequent status feedback.

## Repo conventions to follow

`packages/react/src/motion.ts` provides `QUICK_TWEEN` (150ms) and `EASE_OUT_CSS`. `StepsGroup.tsx:368` deliberately keeps the disclosure open between tool calls; preserve this behavior. `packages/react/MOTION.md` allows progress loops but does not justify delaying useful content.

## Steps

1. In `StepsGroup.tsx`, remove the outer row's `opencx-fade-up` and `animationDelay`. Keep the stable row wrapper, key, and child components; do not alter tool payload rendering.
2. Replace `VanishingLabel`'s timer/ref/phase state with the current final label (`labels.at(-1) ?? ''`). Keep the same typography and truncation. Remove `active` from this internal component if it no longer has a caller-side purpose.
3. Search every current caller of `opencx-placeholder-in` / `opencx-placeholder-out`. If none remain, remove only those two CSS rules/keyframes and their entries from the reduced-motion list and motion inventory/tests. Preserve `opencx-fade-up` where detail disclosures still use it; do not perform a general CSS cleanup.
4. Add `/private/tmp/payla-a506-widget/packages/react/src/components/__tests__/steps-group-feedback.spec.tsx`. Cover a 30-step live group, reopening a completed group, and several collapsed label updates inside 180ms. The newest label must be present after every update without advancing timers. Preserve tests for tool visibility and reasoning content.

## Boundaries

- Do not change model generation, backend timing, transport throttling, step grouping, payload permissions, or disclosure defaults.
- Do not add an animation queue or dependency.
- Do not modify the plan card in this change.
- No local typechecking; use existing CI. Recheck source if the stamped excerpts have drifted.

## Verification

- **Mechanical**, from `packages/react`: `pnpm exec vitest run --typecheck.enabled=false src/components/__tests__/steps-group-feedback.spec.tsx src/components/__tests__/streaming-turn-working.spec.tsx src/__tests__/motion-contract.spec.ts`. Run scoped ESLint/Prettier and `pnpm run build`; production guard must pass.
- **Feel check** on Payla with tool activity visible: the newest row of a long task appears as soon as its data arrives; reopening old tool history has no cascading entrance. Rapid collapsed updates never leave a blank label. At 10% playback there must be no delayed row or postponed label replacement.
- Under reduced motion the same latest labels remain visible; spinner behavior stays governed by its accessibility policy.
- **Done when**: no index-dependent feedback delay and no timer-dependent collapsed label, with existing grouping and visibility behavior preserved.
