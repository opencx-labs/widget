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
 * and host CSS must not win while framed. Every mount receives an owner lease;
 * the global attributes reflect the most recently opened owner, and the final
 * release removes every attribute/style and restores scroll.
 */

import {
  DEFAULT_SIDEBAR_WIDTH,
  RADII,
  SIDEBAR_FULL_BLEED_MAX_WIDTH,
  SIDEBAR_MARGIN,
} from './companion-geometry.utils';
import { APP_FRAME_EASE_CSS } from './materials';

const FRAME_ATTR = 'data-opencx-app-frame';
const STYLE_ATTR = 'data-opencx-app-frame-style';
const OPEN_ATTR = 'data-opencx-sidebar-open';
const NO_ANIM_ATTR = 'data-opencx-frame-no-anim';
const FIT_ATTR = 'data-opencx-fixed-fit';
const WIDTH_VAR = '--opencx-sidebar-w';
const EASE = APP_FRAME_EASE_CSS;

let styleEl: HTMLStyleElement | null = null;
let fitObserver: MutationObserver | null = null;
let ownerOrder = 0;

type AppFrameOwner = {
  canvas: string;
  dir: string;
  pageBackground: string;
  open: boolean;
  width: number;
  animated: boolean;
  order: number;
};

const owners = new Map<symbol, AppFrameOwner>();

export type AppFrameLease = {
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setAnimated: (animated: boolean) => void;
  release: () => void;
};

const NOOP_LEASE: AppFrameLease = {
  setOpen: () => {},
  setWidth: () => {},
  setAnimated: () => {},
  release: () => {},
};

function activeOwner(): AppFrameOwner | undefined {
  let latest: AppFrameOwner | undefined;
  let latestOpen: AppFrameOwner | undefined;
  owners.forEach((owner) => {
    if (!latest || owner.order > latest.order) latest = owner;
    if (owner.open && (!latestOpen || owner.order > latestOpen.order)) {
      latestOpen = owner;
    }
  });
  return latestOpen ?? latest;
}

function applyOwnerState(): void {
  const owner = activeOwner();
  if (!owner || !styleEl) return;

  styleEl.textContent = buildCss(owner.canvas, owner.dir, owner.pageBackground);
  const html = document.documentElement;
  if (owner.open) html.setAttribute(OPEN_ATTR, '');
  else html.removeAttribute(OPEN_ATTR);
  if (owner.animated) html.removeAttribute(NO_ANIM_ATTR);
  else html.setAttribute(NO_ANIM_ATTR, '');
  html.style.setProperty(WIDTH_VAR, `${owner.width}px`);
}

/**
 * Viewport-unit shells (`position: fixed; width: 100vw` — Tailwind
 * `w-screen`/`w-svw`) don't shrink with the frame, so the framed page grows
 * a horizontal scrollbar instead of narrowing. `contain: strict` already
 * makes body the containing block for every fixed descendant, so a
 * `max-width/max-height: 100%` clamp resolves against the frame — stamped
 * fixed elements shrink with it. Fixed elements only: in-flow wide
 * scrollers (tables, code blocks) must keep their own overflow, and
 * absolute elements resolve % against their positioned ancestor, where the
 * clamp would shrink legitimate popovers. CSS can't select by computed
 * position, hence the attribute stamp.
 */
function stampFixedElements(root: Element): void {
  if (getComputedStyle(root).position === 'fixed') {
    root.setAttribute(FIT_ATTR, '');
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (getComputedStyle(el).position === 'fixed') {
      el.setAttribute(FIT_ATTR, '');
    }
  }
}

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
html[${FRAME_ATTR}] body [${FIT_ATTR}] {
  max-width: 100% !important;
  max-height: 100% !important;
}
html[${OPEN_ATTR}] body {
  top: ${SIDEBAR_MARGIN}px !important;
  bottom: ${SIDEBAR_MARGIN}px !important;
  ${start}: ${SIDEBAR_MARGIN}px !important;
  ${end}: calc(var(${WIDTH_VAR}, ${DEFAULT_SIDEBAR_WIDTH}px) + ${SIDEBAR_MARGIN * 2}px) !important;
  border-radius: ${RADII.sidebar}px !important;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.06), 0 10px 24px -6px rgba(0,0,0,0.10) !important;
}
@media (max-width: ${SIDEBAR_FULL_BLEED_MAX_WIDTH}px) {
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
}): AppFrameLease {
  if (typeof document === 'undefined') return NOOP_LEASE;
  const html = document.documentElement;
  // Respect a frame owned by another script/runtime without claiming it.
  if (!styleEl && html.hasAttribute(FRAME_ATTR)) return NOOP_LEASE;

  if (!styleEl) {
    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, '');
    document.head.appendChild(style);

    const prevScrollY = window.scrollY;
    html.setAttribute(FRAME_ATTR, '');
    document.body.scrollTop = prevScrollY;

    // Fit-clamp every fixed element now, and keep stamping ones the host adds
    // while framed (SPA route changes remount shells; menus/toasts portal in).
    stampFixedElements(document.body);
    fitObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element) stampFixedElements(node);
        }
      }
    });
    fitObserver.observe(document.body, { childList: true, subtree: true });
    styleEl = style;
  }

  const ownerId = Symbol('opencx-app-frame-owner');
  const owner: AppFrameOwner = {
    canvas,
    dir,
    pageBackground,
    open: false,
    width: DEFAULT_SIDEBAR_WIDTH,
    animated: true,
    order: ++ownerOrder,
  };
  owners.set(ownerId, owner);
  applyOwnerState();

  let released = false;
  const update = (change: (current: AppFrameOwner) => void) => {
    if (released) return;
    const current = owners.get(ownerId);
    if (!current) return;
    change(current);
    applyOwnerState();
  };
  return {
    setOpen(open) {
      update((current) => {
        current.open = open;
        if (open) current.order = ++ownerOrder;
      });
    },
    setWidth(width) {
      update((current) => {
        current.width = width;
      });
    },
    setAnimated(animated) {
      update((current) => {
        current.animated = animated;
      });
    },
    release() {
      if (released) return;
      released = true;
      owners.delete(ownerId);
      if (owners.size === 0) teardownAppFrame();
      else applyOwnerState();
    },
  };
}

function teardownAppFrame(): void {
  if (!styleEl) return;
  const prevScrollTop = document.body.scrollTop;
  const html = document.documentElement;
  html.removeAttribute(FRAME_ATTR);
  html.removeAttribute(OPEN_ATTR);
  html.removeAttribute(NO_ANIM_ATTR);
  html.style.removeProperty(WIDTH_VAR);
  fitObserver?.disconnect();
  fitObserver = null;
  for (const el of Array.from(document.querySelectorAll(`[${FIT_ATTR}]`))) {
    el.removeAttribute(FIT_ATTR);
  }
  styleEl.remove();
  styleEl = null;
  window.scrollTo({ top: prevScrollTop });
}

/** Force cleanup for legacy callers and test teardown. New mounts should
 * release their lease so owners cannot tear down each other's host frame. */
export function unmountAppFrame(): void {
  owners.clear();
  teardownAppFrame();
}
