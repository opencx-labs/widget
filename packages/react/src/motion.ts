/**
 * The widget's motion tokens (see MOTION.md) and the companion's shadow
 * materials. Surfaces are theme tokens (palette / primaryColor via cssVars
 * on the host shell) so embedder customizations apply to companion chrome
 * exactly like popover; only the shadows live here. There is no frosted
 * glass — a filter inside the iframe can only sample the iframe's own
 * document, never the host page.
 *
 * Rings and rim highlights stay whisper-faint: bright white edges read as
 * "weird white borders" on dark host pages.
 */

/** Strong ease-out for entering/exiting chrome (fades, veils, headers). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_OUT_CSS = `cubic-bezier(${EASE_OUT.join(', ')})`;

/** The default enter: a 200ms fade on `EASE_OUT`. */
export const FADE_TRANSITION = { duration: 0.2, ease: EASE_OUT } as const;

/**
 * The 150ms micro-feedback tween: exits (50ms snappier than the enter, a
 * sanctioned asymmetry), reduced-motion stand-ins for the morph spring, and
 * the pill settling after a drag.
 */
export const QUICK_TWEEN = { duration: 0.15, ease: EASE_OUT } as const;

/**
 * The shared morph spring: near-critically damped (ratio ≈ 1.0 at stiffness
 * 500 / mass 1), so the morph stays snappy but never overshoots. An
 * underdamped spring (damping 40 → ratio 0.89) made the companion input bar's
 * height bounce every time it settled — reads as jitter on a text composer,
 * which should feel crisp, not springy. The popover open/close rides the same
 * curve so both shells share one motion signature.
 */
export const MORPH_SPRING = {
  type: 'spring',
  stiffness: 500,
  damping: 45,
  mass: 1,
} as const;

/**
 * The app-frame's inset transition curve — a settling ease-out with a hint of
 * deceleration. The frame animates via a CSS transition (app-frame.ts), so
 * only the `cubic-bezier(…)` form is exported; the control points stay
 * private. The frame deliberately shares this one curve everywhere it moves
 * so the host page and the panel read as one choreography.
 */
const APP_FRAME_EASE = [0.32, 0.72, 0.24, 1] as const;
export const APP_FRAME_EASE_CSS = `cubic-bezier(${APP_FRAME_EASE.join(', ')})`;

/**
 * The shell spring-interpolates between these shadows during the morph, and
 * complex values only interpolate when their structure matches — a mismatched
 * shadow count or length count makes the whole shadow snap mid-morph instead.
 * So every constant fills the same four slots (large soft, small soft, ring,
 * inset top highlight), all with explicit spread, padding unused slots with
 * transparent zero-size entries (same trick as app-frame's transparent ring).
 */
export const PILL_SHADOW =
  '0 2px 12px 0 rgba(0,0,0,0.18), 0 1px 4px 0 rgba(0,0,0,0), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 0 rgba(255,255,255,0)';

export const DOCK_SHADOW =
  '0 8px 28px 0 rgba(0,0,0,0.10), 0 1px 4px 0 rgba(0,0,0,0), 0 0 0 1px rgba(0,0,0,0.05), inset 0 1px 0 0 rgba(255,255,255,0.5)';

export const INPUT_SHADOW =
  '0 12px 40px 0 rgba(0,0,0,0.12), 0 2px 8px 0 rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.05), inset 0 1px 0 0 rgba(255,255,255,0.5)';

export const CHAT_SHADOW =
  '0 24px 48px -16px rgba(0,0,0,0.18), 0 4px 16px 0 rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05), inset 0 1px 0 0 rgba(255,255,255,0.5)';
