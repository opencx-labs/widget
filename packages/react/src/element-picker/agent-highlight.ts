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
/** Breathing room between the element and the sharp window's edge. */
const WINDOW_PADDING_PX = 6;
const PANEL_Z = '2147483000';
const RING_Z = '2147483001';
const CALLOUT_Z = '2147483002';

/**
 * Spotlight an element on the host page: scroll it into view, dim + blur
 * everything AROUND it, and pulse a ring on it with an optional pointing
 * callout. Dismisses on click, Esc, or after a few seconds.
 *
 * The dim/blur is four fixed panels tiling the viewport around the element's
 * rect, leaving a sharp, still-interactive window over the element itself. We
 * deliberately do NOT promote the real element above a full-screen veil
 * (`z-index` + `isolation: isolate`): that only works when no ancestor forms a
 * stacking context, and on real host pages (transformed / filtered / portaled
 * containers) the element stays trapped behind the blur — you get a floating
 * label pointing at a blurred target. Cutting the window instead is robust on
 * any DOM, because nothing needs to be lifted and the element is never touched.
 *
 * The ring is likewise a top-level overlay tracking the element's rect every
 * frame (survives smooth scroll and layout shifts), in the widget's theme
 * `primaryColor` — not a hardcoded accent. Where `backdrop-filter` is
 * unsupported (some embedded webviews) the panels fall back to a plain dim.
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
  container.style.pointerEvents = 'none';

  const setRect = (
    node: HTMLElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.width = `${Math.max(0, w)}px`;
    node.style.height = `${Math.max(0, h)}px`;
  };

  // The four panels. Each re-enables pointer events so clicks off the element
  // are trapped (the window over the element stays clickable).
  const makePanel = () => {
    const panel = document.createElement('div');
    panel.setAttribute('data-cx-role', 'panel');
    Object.assign(panel.style, {
      position: 'fixed',
      zIndex: PANEL_Z,
      background: supportsBlur
        ? 'rgba(17, 17, 20, 0.28)'
        : 'rgba(17, 17, 20, 0.5)',
      opacity: '0',
      transition: 'opacity 320ms ease',
      pointerEvents: 'auto',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    if (supportsBlur) {
      panel.style.backdropFilter = 'blur(3px) saturate(0.9)';
      panel.style.setProperty(
        '-webkit-backdrop-filter',
        'blur(3px) saturate(0.9)',
      );
    }
    container.appendChild(panel);
    return panel;
  };
  const panelTop = makePanel();
  const panelBottom = makePanel();
  const panelLeft = makePanel();
  const panelRight = makePanel();

  // Sharp pulsing ring, drawn as its own top-level layer over the window.
  const ringBase = `0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 0 5px ${accentColor}`;
  const ringLift = '0 18px 40px -12px rgba(0, 0, 0, 0.45)';
  const ringGlow = `color-mix(in srgb, ${accentColor} 55%, transparent)`;
  const ring = document.createElement('div');
  ring.setAttribute('data-cx-role', 'ring');
  Object.assign(ring.style, {
    position: 'fixed',
    zIndex: RING_Z,
    borderRadius: '12px',
    pointerEvents: 'none',
    boxShadow: `${ringBase}, 0 0 0 0 ${ringGlow}, ${ringLift}`,
    opacity: '0',
    transition: 'opacity 250ms cubic-bezier(0.23, 1, 0.32, 1)',
  } satisfies Partial<CSSStyleDeclaration>);
  container.appendChild(ring);

  // Dark pill + arrow. Created synchronously so the label is in the DOM
  // immediately; revealed once the smooth-scroll settles.
  let callout: HTMLDivElement | null = null;
  let arrow: HTMLDivElement | null = null;
  if (input.label) {
    callout = document.createElement('div');
    callout.setAttribute('data-cx-role', 'callout');
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

  let animation: Animation | null = null;
  if (!prefersReducedMotion && typeof ring.animate === 'function') {
    animation = ring.animate(
      [
        { boxShadow: `${ringBase}, 0 0 0 0 ${ringGlow}, ${ringLift}` },
        {
          boxShadow: `${ringBase}, 0 0 0 14px transparent, ${ringLift}`,
          offset: 0.7,
        },
        { boxShadow: `${ringBase}, 0 0 0 14px transparent, ${ringLift}` },
      ],
      { duration: 2000, iterations: Infinity, easing: 'ease-out' },
    );
  }

  // Follow the element every frame: the four panels re-tile around its live
  // rect, so the window (and the ring on it) stay glued through smooth scroll.
  let rafId = 0;
  const track = () => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wx = r.left - WINDOW_PADDING_PX;
    const wy = r.top - WINDOW_PADDING_PX;
    const ww = r.width + WINDOW_PADDING_PX * 2;
    const wh = r.height + WINDOW_PADDING_PX * 2;

    // Full-width bands above/below, side strips beside — together they tile the
    // viewport minus the window, with no gap and no overlap.
    setRect(panelTop, 0, 0, vw, wy);
    setRect(panelBottom, 0, wy + wh, vw, vh - (wy + wh));
    setRect(panelLeft, 0, wy, wx, wh);
    setRect(panelRight, wx + ww, wy, vw - (wx + ww), wh);
    setRect(ring, wx, wy, ww, wh);

    if (callout && arrow) {
      const side = r.top > 90 ? 'top' : 'bottom';
      const cw = Math.min(240, callout.offsetWidth || 240);
      const left = Math.max(
        12,
        Math.min(r.left + r.width / 2 - cw / 2, vw - cw - 12),
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
    }
    rafId = requestAnimationFrame(track);
  };
  track();

  // Fade in once the first positions are set.
  requestAnimationFrame(() => {
    panelTop.style.opacity = '1';
    panelBottom.style.opacity = '1';
    panelLeft.style.opacity = '1';
    panelRight.style.opacity = '1';
    ring.style.opacity = '1';
  });
  const calloutTimer = callout
    ? window.setTimeout(() => {
        if (!callout) return;
        callout.style.opacity = '1';
        callout.style.transform = 'translateY(0)';
      }, 350)
    : 0;

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    cancelAnimationFrame(rafId);
    window.clearTimeout(timeoutId);
    window.clearTimeout(calloutTimer);
    document.removeEventListener('click', onInteract, true);
    document.removeEventListener('keydown', onKeyDown, true);
    animation?.cancel();
    for (const node of [panelTop, panelBottom, panelLeft, panelRight, ring]) {
      node.style.opacity = '0';
    }
    if (callout) callout.style.opacity = '0';
    window.setTimeout(() => container.remove(), 300);
  };

  const onInteract = () => dismiss();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };
  const timeoutId = window.setTimeout(dismiss, HIGHLIGHT_DURATION_MS);
  document.addEventListener('click', onInteract, true);
  document.addEventListener('keydown', onKeyDown, true);

  return true;
}
