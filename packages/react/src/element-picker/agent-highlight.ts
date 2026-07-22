import { z } from 'zod';
import { resolveElementByHint } from './element-info';

/**
 * The AI's browser-effect tool: the backend defines `highlight_element` with an
 * instant server-side ack, and the widget — watching the turn's streamed tool
 * parts — performs the actual highlight on the host page (see `useAgentChat`).
 */
export const HIGHLIGHT_ELEMENT_TOOL_NAME = 'highlight_element';

export const highlightElementInputSchema = z.object({
  selector: z.string().optional(),
  text: z.string().optional(),
  label: z.string().optional(),
});

export type HighlightElementInput = z.infer<typeof highlightElementInputSchema>;

const HIGHLIGHT_DURATION_MS = 6000;
// Layer order: veil dims the page, the real element is lifted one above it,
// and the callout floats above the element.
const VEIL_Z = '2147483000';
const ELEMENT_Z = '2147483001';
const CALLOUT_Z = '2147483002';

/**
 * Spotlight an element on the host page: scroll it into view, dim + blur the
 * rest of the page behind a veil, lift the element itself above that veil, and
 * pulse a ring around it (plus an optional pointing callout). Dismisses on
 * click, Esc, or after a few seconds, restoring the element untouched.
 *
 * The veil is a single fixed layer with `backdrop-filter: blur()`. The element
 * stays sharp because we promote it above the veil with a higher `z-index` AND
 * `isolation: isolate` — the isolate is the critical bit: without a fresh
 * stacking context the element would be blurred along with everything behind
 * the veil. (Caveat: promotion can't escape an ancestor that already forms a
 * stacking context — a transformed/filtered/opacity<1 parent — so on those
 * pages the element blurs with the rest; acceptable for the common case.)
 *
 * The ring is in the widget's theme `primaryColor` (passed by the caller), not
 * a hardcoded accent. Where `backdrop-filter` is unsupported (some embedded
 * webviews) we fall back to a plain darker veil without blur.
 *
 * Returns false when the hint doesn't resolve to an element (the page may have
 * changed since the context was captured) — callers treat that as a no-op.
 */
export function highlightElementOnHostPage(
  input: HighlightElementInput,
  { accentColor = 'hsl(0 0% 9%)' }: { accentColor?: string } = {},
): boolean {
  const el = resolveElementByHint(input);
  if (!el) return false;

  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

  const supportsBlur =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    (CSS.supports('backdrop-filter', 'blur(3px)') ||
      CSS.supports('-webkit-backdrop-filter', 'blur(3px)'));
  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Widget-owned marker: the picker must never target the effect's own nodes.
  const container = document.createElement('div');
  container.setAttribute('data-opencx-picker-overlay', '');

  // 1) The veil: dims and (where supported) blurs the whole page. Its
  //    `pointer-events` stay on so it traps clicks off the highlighted element.
  const veil = document.createElement('div');
  Object.assign(veil.style, {
    position: 'fixed',
    inset: '0',
    zIndex: VEIL_Z,
    background: supportsBlur ? 'rgba(17, 17, 20, 0.28)' : 'rgba(17, 17, 20, 0.5)',
    opacity: '0',
    transition: 'opacity 320ms ease',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  if (supportsBlur) {
    veil.style.backdropFilter = 'blur(3px) saturate(0.9)';
    veil.style.setProperty('-webkit-backdrop-filter', 'blur(3px) saturate(0.9)');
  }
  container.appendChild(veil);

  // 2) The callout: dark pill + arrow that points at the element. Created
  //    synchronously (so the label is in the DOM immediately) and positioned
  //    once the smooth-scroll settles.
  let callout: HTMLDivElement | null = null;
  let arrow: HTMLDivElement | null = null;
  if (input.label) {
    callout = document.createElement('div');
    Object.assign(callout.style, {
      position: 'fixed',
      zIndex: CALLOUT_Z,
      background: '#1a1a1e',
      color: '#fff',
      font: '500 13px/1.4 system-ui, sans-serif',
      padding: '9px 13px',
      borderRadius: '11px',
      maxWidth: '240px',
      boxShadow: '0 10px 30px -8px rgba(0, 0, 0, 0.5)',
      opacity: '0',
      transform: 'translateY(4px)',
      transition: 'opacity 280ms ease, transform 280ms ease',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    callout.textContent = input.label;
    arrow = document.createElement('div');
    Object.assign(arrow.style, {
      position: 'absolute',
      width: '10px',
      height: '10px',
      background: '#1a1a1e',
      transform: 'rotate(45deg)',
    } satisfies Partial<CSSStyleDeclaration>);
    callout.appendChild(arrow);
    container.appendChild(callout);
  }

  document.documentElement.appendChild(container);

  // 3) Lift the real element above the veil and ring it. Save the inline
  //    properties we touch so dismiss restores the element exactly.
  const prev = {
    position: el.style.position,
    zIndex: el.style.zIndex,
    isolation: el.style.isolation,
    boxShadow: el.style.boxShadow,
  };
  if (window.getComputedStyle(el).position === 'static') {
    el.style.position = 'relative';
  }
  el.style.zIndex = ELEMENT_Z;
  el.style.isolation = 'isolate';

  const rings = `0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 0 5px ${accentColor}`;
  const lift = '0 18px 40px -12px rgba(0, 0, 0, 0.45)';
  const glow = `color-mix(in srgb, ${accentColor} 55%, transparent)`;
  // Static ring as the reduced-motion / no-WAAPI floor; the pulse animates on
  // top of it and reverts to this on cancel.
  el.style.boxShadow = `${rings}, 0 0 0 0 ${glow}, ${lift}`;

  let animation: Animation | null = null;
  if (!prefersReducedMotion && typeof el.animate === 'function') {
    animation = el.animate(
      [
        { boxShadow: `${rings}, 0 0 0 0 ${glow}, ${lift}` },
        { boxShadow: `${rings}, 0 0 0 14px transparent, ${lift}`, offset: 0.7 },
        { boxShadow: `${rings}, 0 0 0 14px transparent, ${lift}` },
      ],
      { duration: 2000, iterations: Infinity, easing: 'ease-out' },
    );
  }

  requestAnimationFrame(() => {
    veil.style.opacity = '1';
  });

  const positionCallout = () => {
    if (!callout || !arrow) return;
    const r = el.getBoundingClientRect();
    const side = r.top > 90 ? 'top' : 'bottom';
    const cw = Math.min(240, callout.offsetWidth || 240);
    const left = Math.max(
      12,
      Math.min(r.left + r.width / 2 - cw / 2, window.innerWidth - cw - 12),
    );
    callout.style.left = `${left}px`;
    callout.style.width = `${cw}px`;
    callout.style.top =
      side === 'top'
        ? `${r.top - callout.offsetHeight - 12}px`
        : `${r.bottom + 12}px`;
    // Arrow tracks the element's centre, clamped inside the pill.
    arrow.style.left = `${Math.max(10, Math.min(r.left + r.width / 2 - left - 5, cw - 20))}px`;
    if (side === 'top') {
      arrow.style.bottom = '-4px';
      arrow.style.top = '';
    } else {
      arrow.style.top = '-4px';
      arrow.style.bottom = '';
    }
    callout.style.opacity = '1';
    callout.style.transform = 'translateY(0)';
  };

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    window.clearTimeout(timeoutId);
    window.clearTimeout(calloutTimer);
    document.removeEventListener('click', onInteract, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onReposition, true);
    window.removeEventListener('resize', onReposition);
    animation?.cancel();
    // Restore the element untouched.
    el.style.position = prev.position;
    el.style.zIndex = prev.zIndex;
    el.style.isolation = prev.isolation;
    el.style.boxShadow = prev.boxShadow;
    veil.style.opacity = '0';
    if (callout) callout.style.opacity = '0';
    window.setTimeout(() => container.remove(), 300);
  };

  const onInteract = () => dismiss();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };
  const onReposition = () => positionCallout();
  const timeoutId = window.setTimeout(dismiss, HIGHLIGHT_DURATION_MS);
  const calloutTimer = callout ? window.setTimeout(positionCallout, 350) : 0;
  document.addEventListener('click', onInteract, true);
  document.addEventListener('keydown', onKeyDown, true);
  if (callout) {
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
  }

  return true;
}
