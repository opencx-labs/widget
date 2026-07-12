/**
 * The companion's visual material system. Surfaces are theme tokens
 * (palette / primaryColor via cssVars on the host shell) so embedder
 * customizations apply to companion chrome exactly like popover; only the
 * shadows live here. Frosted glass is currently disabled — if it returns,
 * it returns as a host-DOM backdrop-filter (a filter inside the iframe can
 * only sample the iframe's own document, never the host page).
 *
 * Rings and rim highlights stay whisper-faint: bright white edges read as
 * "weird white borders" on dark host pages.
 */

/** Strong ease-out for entering/exiting chrome (fades, veils, headers). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

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

/**
 * Fullscreen is a MODAL, not a bigger card: veil below, opaque surface
 * above, host scroll locked. The veil must never tint or darken the
 * customer's page; both page-touching effects (veil, scroll lock) are
 * embedder-configurable (companion.fullscreen).
 */
export const SCRIM_BACKDROP_FILTER = 'none';
