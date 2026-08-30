import { annotate, type AnnotationType } from '@shardsui/notation';
import { z } from 'zod';
import { resolveElementByHint } from './page-element';
import { adoptNotationInk } from './page-mark';

/**
 * The AI's browser-effect tool: the backend defines `highlight_element` with an
 * instant server-side ack, and the widget — watching the turn's streamed tool
 * parts — performs the actual highlight on the host page (see
 * `AgentChatPageEffects`).
 *
 * The highlight itself is hand-drawn ink (`@shardsui/notation`): a mark thrown
 * around the element in the widget's theme color, plus an optional pointing
 * callout. Because the ink is an SVG sibling of the target — absolutely
 * positioned, `pointer-events: none`, laid out in PAGE coordinates — it scrolls
 * with the element for free, never traps a click, and never shifts the host
 * page's layout. That deletes the old spotlight's whole failure surface (the
 * four dim panels re-tiled around the element every frame, each re-enabling
 * pointer events). The one trade: an `overflow: hidden` ancestor can clip the
 * mark's padding — acceptable, since the element is scrolled into view first
 * and the ink hugs it closely.
 *
 * Dismisses on click, Esc, or after a few seconds — by UN-drawing itself (the
 * strokes reverse-play), which reads as the hand lifting off the page.
 */
export const HIGHLIGHT_ELEMENT_TOOL_NAME = 'highlight_element';

/**
 * Mark styles the model may request — a deliberate subset of notation's types.
 * `highlight` is excluded because it is the one type that mutates the target's
 * own `position`/`z-index` (never touch a customer's element); the deletion
 * marks (`strike-through`, `crossed-off`) read as "this is wrong/removed", the
 * opposite of pointing something out.
 */
const HIGHLIGHT_MARK_TYPES = [
  'circle',
  'box',
  'underline',
  'bracket',
  'arrow',
] as const;

export const highlightElementInputSchema = z.object({
  selector: z.string().optional(),
  text: z.string().optional(),
  label: z.string().optional(),
  /**
   * Optional mark style. `.catch(undefined)` so a model-invented type degrades
   * to the size heuristic instead of failing the whole highlight.
   */
  type: z.enum(HIGHLIGHT_MARK_TYPES).optional().catch(undefined),
});

type HighlightElementInput = z.infer<typeof highlightElementInputSchema>;

const DEFAULT_HIGHLIGHT_DURATION_MS = 8000;

/**
 * When the model doesn't ask for a mark style, choose like a person with a pen
 * would: underline prose-shaped inlines (links, terms), circle small controls
 * (buttons, icons, menu items), box anything bigger — a circle inflates its
 * box and would swallow the neighbours of a large region.
 */
function autoMarkType(
  rect: DOMRect,
  style: CSSStyleDeclaration,
  fontSize: number,
): AnnotationType {
  if (style.display === 'inline' && rect.height <= fontSize * 2.5) {
    return 'underline';
  }
  if (rect.width <= 220 && rect.height <= 80) return 'circle';
  return 'box';
}

/**
 * One highlight at a time: a new call un-draws the one still showing, so
 * consecutive tool calls read as the hand moving from mark to mark instead of
 * ink piling up.
 */
let activeDismiss: (() => void) | null = null;

/** Programmatically clear the current highlight (also used by tests). */
export function dismissActiveHighlight() {
  activeDismiss?.();
}

/**
 * Ink a mark on an element of the host page: scroll it into view, hand-draw
 * the mark on it (the ink is glued to the element, so it rides along with the
 * smooth scroll), and float an optional pointing callout. The page stays fully
 * interactive throughout — nothing is dimmed and no click is trapped.
 *
 * Returns false when the hint doesn't resolve to an element (the page may have
 * changed since the context was captured) — callers treat that as a no-op.
 */
export function highlightElementOnHostPage(
  input: HighlightElementInput,
  {
    accentColor = 'hsl(0 0% 9%)',
    surfaceColor = 'hsl(0 0% 9%)',
    foregroundColor = 'hsl(0 0% 98%)',
    zIndex = 10_000_002,
    durationMs = DEFAULT_HIGHLIGHT_DURATION_MS,
    seed,
  }: {
    accentColor?: string;
    surfaceColor?: string;
    foregroundColor?: string;
    zIndex?: number;
    durationMs?: number;
    seed?: number;
  } = {},
): boolean {
  const el = resolveElementByHint(input);
  if (!el) return false;

  // The hand moves on: release the previous mark before throwing this one.
  activeDismiss?.();

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // For reduced-motion users the page-level smooth scroll is the single most
  // motion-sick part of the whole effect — jump-cut instead. (The ink's own
  // draw is already forced instant internally by notation.)
  el.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'center',
    inline: 'nearest',
  });

  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const fontSize = parseFloat(style.fontSize) || 16;
  const small = rect.width < 160 && rect.height < 56;

  const marker = annotate(el, {
    type: input.type ?? autoMarkType(rect, style, fontSize),
    color: accentColor,
    // ~0.1em of the target's type size, clamped to stay a pen not a brush.
    strokeWidth: Math.min(3, Math.max(1.6, fontSize * 0.11)),
    // Calmer hand over small, dense UI; a fuller sway on big regions.
    wobble: small ? 0.6 : 0.9,
    // Pen travels with the target's reading direction.
    rtl: style.direction === 'rtl',
    seed,
  });

  let dismissed = false;
  const draw = () => {
    if (dismissed) return;
    try {
      marker.show();
      adoptNotationInk(el, zIndex);
    } catch (err) {
      // The mark is decoration — a draw failure must never break the chat.
      console.warn('highlight_element: mark could not be drawn', err);
    }
  };
  // Draw after webfonts settle (a swap reflows text under already-placed ink);
  // where FontFaceSet is missing (jsdom, old webviews) draw immediately.
  const fonts = document.fonts as FontFaceSet | undefined;
  if (fonts?.ready && typeof fonts.ready.then === 'function') {
    void fonts.ready.then(draw);
  } else {
    draw();
  }

  // Widget-owned overlay for the callout. Created even without a label so the
  // effect has one consistent, cleanable DOM footprint.
  const container = document.createElement('div');
  container.setAttribute('data-opencx-overlay', '');
  container.style.pointerEvents = 'none';

  // Dark pill + arrow, fixed-position and glued to the element's live rect by
  // a per-frame tracker (survives smooth scroll and layout shifts). Revealed
  // once the scroll has visibly begun settling.
  let callout: HTMLDivElement | null = null;
  let arrow: HTMLDivElement | null = null;
  if (input.label) {
    callout = document.createElement('div');
    callout.setAttribute('data-cx-role', 'callout');
    Object.assign(callout.style, {
      position: 'fixed',
      zIndex: String(zIndex + 1),
      background: surfaceColor,
      color: foregroundColor,
      font: '500 13px/1.4 system-ui, sans-serif',
      padding: '9px 13px',
      borderRadius: '11px',
      maxWidth: '240px',
      boxShadow: `0 10px 30px -8px color-mix(in srgb, ${foregroundColor} 35%, transparent)`,
      opacity: '0',
      transform: prefersReducedMotion ? 'none' : 'translateY(4px)',
      transition:
        'opacity 280ms cubic-bezier(0.23, 1, 0.32, 1), transform 280ms cubic-bezier(0.23, 1, 0.32, 1)',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    callout.textContent = input.label;
    arrow = document.createElement('div');
    Object.assign(arrow.style, {
      position: 'absolute',
      width: '10px',
      height: '10px',
      background: surfaceColor,
      transform: 'rotate(45deg)',
    } satisfies Partial<CSSStyleDeclaration>);
    callout.appendChild(arrow);
    container.appendChild(callout);
  }

  document.documentElement.appendChild(container);

  // Track the element only for the callout — the ink follows it natively.
  let rafId = 0;
  if (callout && arrow) {
    const pill = callout;
    const tip = arrow;
    const track = () => {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const side = r.top > 90 ? 'top' : 'bottom';
      const cw = Math.min(240, pill.offsetWidth || 240);
      const left = Math.max(
        12,
        Math.min(r.left + r.width / 2 - cw / 2, vw - cw - 12),
      );
      pill.style.left = `${left}px`;
      pill.style.width = `${cw}px`;
      pill.style.top =
        side === 'top'
          ? `${r.top - pill.offsetHeight - 12}px`
          : `${r.bottom + 12}px`;
      // Arrow tracks the element's centre, clamped inside the pill.
      tip.style.left = `${Math.max(10, Math.min(r.left + r.width / 2 - left - 5, cw - 20))}px`;
      if (side === 'top') {
        tip.style.bottom = '-4px';
        tip.style.top = '';
      } else {
        tip.style.top = '-4px';
        tip.style.bottom = '';
      }
      rafId = requestAnimationFrame(track);
    };
    track();
  }

  const calloutTimer = callout
    ? window.setTimeout(() => {
        if (!callout) return;
        callout.style.opacity = '1';
        callout.style.transform = 'translateY(0)';
      }, 350)
    : 0;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (activeDismiss === dismiss) activeDismiss = null;
    cancelAnimationFrame(rafId);
    window.clearTimeout(timeoutId);
    window.clearTimeout(calloutTimer);
    document.removeEventListener('click', onInteract, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (callout) {
      callout.style.opacity = '0';
      callout.style.transform = prefersReducedMotion
        ? 'none'
        : 'translateY(4px)';
    }
    // The hand lifts off: strokes reverse-play, then everything is released.
    try {
      marker.hide();
      void marker.finished.then(() => marker.remove());
    } catch {
      marker.remove();
    }
    window.setTimeout(() => container.remove(), 300);
  };

  const onInteract = () => dismiss();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };
  const timeoutId = window.setTimeout(dismiss, Math.max(0, durationMs));
  document.addEventListener('click', onInteract, true);
  document.addEventListener('keydown', onKeyDown, true);
  activeDismiss = dismiss;

  return true;
}
