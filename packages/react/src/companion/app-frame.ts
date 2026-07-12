/**
 * The sidebar's "app frame", CSS-only: document.body ITSELF becomes a
 * fixed, full-viewport frame with its own scroller — no host DOM node is
 * ever moved. Opening the sidebar insets body on the inline sides only
 * (16px gap, 20px radius, ring + shadow) so the host page reads as a
 * child window on the canvas. The block sides stay flush on purpose:
 * viewport units don't shrink with the frame, so any top/bottom gap makes
 * a 100vh/100dvh host shell overflow by exactly that gap and grow a stray
 * scrollbar. Full height keeps vh-sized apps fitting exactly.
 *
 * Why no reparenting: the previous implementation moved body's children
 * into a widget-owned frame div. That detaches nodes the host framework
 * owns — a React host crashes with "NotFoundError: removeChild" the moment
 * it unmounts a body-level portal (Radix menus, tooltips, toasts) that the
 * frame captured. Styling body in place is the same visual with zero DOM
 * mutation.
 *
 * `contain: strict` is still the load-bearing line: it makes body the
 * containing block for the host's OWN fixed/sticky elements (app rails,
 * navbars), so the entire app shrinks as one — while the widget itself,
 * portaled to document.documentElement (see useHostPortal), stays outside
 * the containment and viewport-fixed.
 *
 * html gets overflow:hidden so body's overflow:auto scrolls body itself
 * instead of propagating to the viewport, and the canvas color sits on
 * html (body's own background can't propagate past its paint containment).
 * Everything is attribute-scoped with !important — body is host territory
 * and host CSS must not win while framed. Mount is idempotent; unmount
 * removes every attribute/style and restores the scroll position.
 */

const FRAME_ATTR = 'data-opencx-app-frame';
const STYLE_ATTR = 'data-opencx-app-frame-style';
const OPEN_ATTR = 'data-opencx-sidebar-open';
const NO_ANIM_ATTR = 'data-opencx-frame-no-anim';
const WIDTH_VAR = '--opencx-sidebar-w';
const EASE = 'cubic-bezier(0.32, 0.72, 0.24, 1)';

let styleEl: HTMLStyleElement | null = null;

function buildCss(canvas: string, dir: string, pageBackground: string): string {
  // The panel sits at the widget's inline-end, which may differ from the
  // host page's direction — resolve to physical sides here instead of
  // relying on body's own dir.
  const [start, end] = dir === 'rtl' ? ['right', 'left'] : ['left', 'right'];
  return `
html[${FRAME_ATTR}] {
  overflow: hidden !important;
  background: ${canvas} !important;
}
html[${FRAME_ATTR}] body {
  position: fixed !important;
  inset: 0 !important;
  margin: 0 !important;
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  overflow: auto !important;
  contain: strict !important;
  background: ${pageBackground} !important;
  border-radius: 0 !important;
  /* Transparent ring+shadow, NOT none — none can't interpolate */
  box-shadow: 0 0 0 1px rgba(0,0,0,0), 0 10px 24px -6px rgba(0,0,0,0) !important;
}
@media (prefers-reduced-motion: no-preference) {
  html[${FRAME_ATTR}] body {
    transition:
      top 0.3s ${EASE}, bottom 0.3s ${EASE},
      left 0.3s ${EASE}, right 0.3s ${EASE},
      border-radius 0.3s ${EASE}, box-shadow 0.3s ${EASE} !important;
  }
}
html[${NO_ANIM_ATTR}] body { transition: none !important; }
html[${OPEN_ATTR}] body {
  top: 16px !important;
  bottom: 16px !important;
  ${start}: 16px !important;
  ${end}: calc(var(${WIDTH_VAR}, 400px) + 32px) !important;
  border-radius: 20px !important;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.06), 0 10px 24px -6px rgba(0,0,0,0.10) !important;
}
@media (max-width: 760px) {
  html[${OPEN_ATTR}] body {
    inset: 0 !important;
    border-radius: 0 !important;
    box-shadow: 0 0 0 1px rgba(0,0,0,0), 0 10px 24px -6px rgba(0,0,0,0) !important;
  }
}
`;
}

export function mountAppFrame({
  canvas,
  dir,
  pageBackground,
}: {
  canvas: string;
  dir: string;
  pageBackground: string;
}): void {
  if (styleEl || typeof document === 'undefined') return;
  const html = document.documentElement;
  if (html.hasAttribute(FRAME_ATTR)) return; // another widget instance already framed the page

  const style = document.createElement('style');
  style.setAttribute(STYLE_ATTR, '');
  style.textContent = buildCss(canvas, dir, pageBackground);
  document.head.appendChild(style);

  const prevScrollY = window.scrollY;
  html.setAttribute(FRAME_ATTR, '');
  document.body.scrollTop = prevScrollY;

  styleEl = style;
}

export function unmountAppFrame(): void {
  if (!styleEl) return;
  const prevScrollTop = document.body.scrollTop;
  const html = document.documentElement;
  html.removeAttribute(FRAME_ATTR);
  html.removeAttribute(OPEN_ATTR);
  html.removeAttribute(NO_ANIM_ATTR);
  html.style.removeProperty(WIDTH_VAR);
  styleEl.remove();
  styleEl = null;
  window.scrollTo({ top: prevScrollTop });
}

export function setFrameOpen(open: boolean): void {
  if (typeof document === 'undefined') return;
  if (open) document.documentElement.setAttribute(OPEN_ATTR, '');
  else document.documentElement.removeAttribute(OPEN_ATTR);
}

export function setFrameWidth(px: number): void {
  document.documentElement.style.setProperty(WIDTH_VAR, `${px}px`);
}

/** Suspend/restore the frame transition during drag-resize. */
export function setFrameAnimated(animated: boolean): void {
  if (animated) document.documentElement.removeAttribute(NO_ANIM_ATTR);
  else document.documentElement.setAttribute(NO_ANIM_ATTR, '');
}
