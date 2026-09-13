# 003 — Respect reduced motion in typing and navigation feedback

- **Status**: TODO
- **Commit**: 3aadc86
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 5 production files and focused tests

## Problem

Repository: `/private/tmp/payla-a506-widget`.

The root `<MotionConfig reducedMotion="user">` governs Framer animations, not CSS keyframes or native scrolling. The iframe stylesheet disables only named OpenCX keyframes.

`packages/react/src/components/custom-components/LoadingDefaultComponent.tsx:28`:

```tsx
<motion.span className="rounded-full animate-bounce [animation-delay:-0.3s]" />
<motion.span className="rounded-full animate-bounce [animation-delay:-0.15s]" />
<motion.span className="rounded-full animate-bounce" />
```

`packages/react/src/components/lib/tooltip.tsx:20` uses `animate-in`, `zoom-in-95` and side-specific slide classes. `packages/react/src/companion/LayoutPicker.tsx:174` uses zoom-in/out CSS. These remain active under reduced motion.

`packages/react/src/screens/chat/agent/useStreamFollow.ts:51`:

```ts
el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
```

The older transcript in `packages/react/src/screens/chat/ChatMain.tsx:81` also has `scroll-smooth` without a reduced-motion override.

## Target

Under `prefers-reduced-motion: reduce`, typing dots stay visible without bouncing, tooltips/menus use opacity-only **150ms** fades with `cubic-bezier(0.23, 1, 0.32, 1)`, and explicit transcript navigation jumps immediately. Preserve regular-mode motion and visible working feedback.

## Repo conventions to follow

`packages/react/src/companion/ConversationTitle.tsx:34` already uses `motion-reduce:animate-none` for activity. The shared iframe stylesheet is `/private/tmp/payla-a506-widget/packages/react/index.css`; host page CSS cannot provide its accessibility policy. Reuse `EASE_OUT_CSS` / Tailwind `ease-opencx`, not new curves. Root motion configuration remains in place.

## Steps

1. Add `motion-reduce:animate-none` to the three bounce classes in `LoadingDefaultComponent.tsx`. Keep the dots and loading bubble. The parent opacity pulse may remain as non-positional progress feedback; do not add further loops.
2. In `tooltip.tsx` and `LayoutPicker.tsx`, add reduced-motion variants that explicitly set both enter/exit zoom scales to 1 and all enter/exit slide offsets to zero. Keep opacity entrance/exit at 150ms on `ease-opencx`. Verify the installed `tailwindcss-animate` variant output; if it cannot express these values, add a narrowly scoped iframe CSS rule with those exact custom-property values. Do not globally disable all animations or transforms.
3. In `useStreamFollow.ts`, read reduced-motion preference when the explicit scroll action runs. Use `behavior: 'instant'` when it is enabled, `'smooth'` otherwise. A native `window.matchMedia('(prefers-reduced-motion: reduce)')` check is sufficient; tolerate environments without matchMedia. Do not change automatic token-follow behavior or its user-scroll release logic.
4. Add `motion-reduce:scroll-auto` beside the legacy `scroll-smooth` class in `ChatMain.tsx`.
5. Add cases to `packages/react/src/screens/chat/agent/__tests__/useStreamFollow.spec.tsx` for normal/reduced mode and runtime preference changes. Extend motion-contract or focused component tests for the CSS reduced-motion variants without replacing existing behavior tests.

## Boundaries

- Do not remove typing feedback or change Stream replies / Reasoning / Tool activity settings.
- Do not change the shell's documented morph, keyboard recall behavior, page scrolling, or custom embed CSS precedence.
- Plan-card reduced motion belongs to plan 001; do not duplicate that work here.
- No new dependencies or local typechecking. Recheck incompatible source drift before implementation.

## Verification

- **Mechanical**, from `packages/react`: `pnpm exec vitest run --typecheck.enabled=false src/screens/chat/agent/__tests__/useStreamFollow.spec.tsx src/components/__tests__/streaming-turn-working.spec.tsx src/__tests__/motion-contract.spec.ts`. Run scoped ESLint/Prettier and `pnpm run build`; production guard must pass.
- **Feel check** on `http://localhost:5173/`: enable OS/DevTools reduced motion, then inspect typing between preambles, tooltips, layout menu, and the scroll-to-bottom action in a long session. Dots remain visible without bouncing; menus fade without travel/zoom; transcript navigation is immediate. Inspect at 10% playback.
- Turn reduced motion off: normal typing/menu motion and smooth explicit scrolling return. Scrolling up during streaming must still release auto-follow.
- **Done when**: reduced motion affects CSS and native scrolling as well as Framer, with all feedback and keyboard/touch interactions intact.
