/**
 * The pointer the visitor watches.
 *
 * Without it the page simply changes: a menu opens, a field fills, and the
 * customer is left to work out whether they did that or something did it to
 * them. A cursor that travels to the control and presses it answers that
 * before they have to ask.
 *
 * It is drawn, never simulated input — the real events still come from
 * `firePointerSequence`. The two are kept in step by aiming both at the same
 * point: the control's centre. If the gesture and the event were allowed to
 * drift apart this would be theatre, and theatre about what an agent did to
 * someone's account is worse than no animation at all.
 *
 * Widget-owned and `pointer-events: none` throughout. It lives inside a
 * fixed, clipped, full-viewport layer so travelling near an edge cannot
 * grow the host page's scroll area, and it never touches a customer
 * element or intercepts a click.
 */

const TRAVEL_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const CURSOR_APPEAR_MS = 260;
/** The long haul. A hand crossing a dashboard takes about this. */
export const CURSOR_TRAVEL_MS = 1600;
/** A hand stops before it presses; without this the two moves read as one jerk. */
export const CURSOR_REST_MS = 180;
export const CURSOR_PRESS_MS = 240;

/**
 * How far the path bows out of the straight line, as a fraction of the
 * distance travelled. A hand swings; a tween slides. Zero here is the thing
 * that made the first version read as a sprite on a rail.
 */
const ARC = 0.13;

/**
 * Minimum-jerk position profile — the one motor control actually produces:
 * still, accelerate, decelerate, still, with no discontinuity at either
 * end. A cubic-bezier on a straight line cannot make this shape.
 */
const minimumJerk = (t: number) => t * t * t * (10 - 15 * t + 6 * t * t);

/** One point along a quadratic curve. */
function onCurve(
  from: { x: number; y: number },
  control: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const inv = 1 - t;
  return {
    x: inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x,
    y: inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y,
  };
}

/**
 * The keyframes for one reach: a bowed path sampled on a minimum-jerk
 * clock, landing on the target and stopping.
 *
 * An earlier version aimed past the target and corrected back, copying the
 * corrective sub-movement people make. On a real reach across a dashboard
 * that is twenty-odd pixels of travelling backwards, and it reads as a
 * bounce — as something going wrong — rather than as a hand. The real
 * version is a few pixels over a few tens of milliseconds, which at this
 * scale is invisible, so it buys nothing and costs the arrival.
 */
function reachFrames(
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 48,
): { transform: string }[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;

  // Bow perpendicular to the line of travel, and always the same way round
  // relative to it, so repeated reaches look like one hand rather than a
  // random walk.
  const control = {
    x: from.x + dx / 2 - (dy / distance) * distance * ARC,
    y: from.y + dy / 2 + (dx / distance) * distance * ARC,
  };
  const frames: { transform: string }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const point = onCurve(from, control, to, minimumJerk(i / steps));
    frames.push({
      transform: `translate(${point.x - HOTSPOT_X}px, ${point.y - HOTSPOT_Y}px)`,
    });
  }
  return frames;
}

/** The tip, in the glyph's own 14×14 box. Everything aims from here. */
const HOTSPOT_X = 2;
const HOTSPOT_Y = 1.7;

const GLYPH = 'M2 1.7 L9.6 8 L6.5 8.4 L7.7 11 L6.3 11.6 L5.1 9 L2.6 10.6 Z';

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, prefersReducedMotion() ? 0 : ms);
  });

type Cursor = {
  /** Travel to a viewport point and stop there. */
  moveTo(x: number, y: number): Promise<void>;
  /** The squash and ring that read as a press. */
  press(): Promise<void>;
  /** Fade out and release the node. */
  release(): void;
};

/**
 * The hand, for as long as it is working.
 *
 * It is deliberately NOT one cursor per action. A flow is several steps —
 * click through, read the new screen, click again — and a pointer that
 * faded out and back in between each one would read as several different
 * things happening rather than one continuous piece of work. It arrives
 * once, stays where it last was, walks to the next control from there, and
 * leaves when the work stops.
 */
let active: Cursor | null = null;

/** Pending "the work seems to have stopped" release. */
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * How long the pointer waits between steps before deciding the flow is
 * over. Long enough to cover a model thinking between two tool calls,
 * short enough that it is not left sitting on a page nobody is acting on.
 */
const CURSOR_IDLE_MS = 4000;

/**
 * Take the pointer off the page NOW.
 *
 * `release` fades, which is right at the end of the work and wrong when
 * something else is starting: the fade outlives the call, so effects in
 * quick succession left ghosts drifting behind the live one. Anything still
 * carrying the marker is removed outright here.
 */
export function dismissAgentCursor(): void {
  clearTimeout(idleTimer);
  active?.release();
  active = null;
  document
    .querySelectorAll('[data-opencx-cursor]')
    .forEach((stale) => stale.remove());
}

/** The flow is still going: hold the pointer where it is. */
function keepAlive(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(dismissAgentCursor, CURSOR_IDLE_MS);
}

/**
 * Put a pointer on the page, or hand back the one already there.
 *
 * Returns null when the document will not have it — the caller then does
 * its own thing silently, because a missing animation must never stop the
 * actual work.
 */
export function showAgentCursor(from?: {
  x: number;
  y: number;
}): Cursor | null {
  // Already working: the same hand continues from wherever it stopped.
  if (active) {
    keepAlive();
    return active;
  }
  try {
    dismissAgentCursor();

    /**
     * A clipping layer, and it is not cosmetic.
     *
     * A fixed-position node on `<html>` still counts towards the document's
     * scrollable area. The reach bows off the straight line, so partway to
     * a control near an edge the cursor goes past the viewport, the host
     * page grows a scrollbar, and everything on it shifts sideways —
     * exactly when the customer is being asked to watch one specific
     * control. `overflow: hidden` on a full-viewport layer means the
     * pointer can travel anywhere without the page knowing it exists.
     */
    const layer = document.createElement('div');
    layer.setAttribute('data-opencx-overlay', '');
    // Its own marker as well as the shared one: the ink and the pointer are
    // both widget overlays, and anything reasoning about "is the mark still
    // up" needs to tell them apart.
    layer.setAttribute('data-opencx-cursor', '');
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '2147483646',
      contain: 'strict',
    } satisfies Partial<CSSStyleDeclaration>);

    const host = document.createElement('div');
    // The pointer itself, distinct from the layer that clips it.
    host.setAttribute('data-opencx-cursor-tip', '');
    Object.assign(host.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '14px',
      height: '14px',
      pointerEvents: 'none',
      opacity: '0',
      transition: `opacity ${CURSOR_APPEAR_MS}ms ease`,
      willChange: 'transform',
    } satisfies Partial<CSSStyleDeclaration>);
    layer.appendChild(host);

    // The rounding is a same-colour stroke with round joins under the fill,
    // not a radius on every vertex: one number to tune, and the silhouette
    // stays a cursor instead of drifting into a blob.
    host.innerHTML = `<svg viewBox="0 0 14 14" width="14" height="14" style="display:block">
      <path d="${GLYPH}" fill="currentColor" stroke="currentColor" stroke-width="1.7"
        stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"
        style="transition: transform ${CURSOR_PRESS_MS}ms ${TRAVEL_EASE}; transform-origin: ${HOTSPOT_X}px ${HOTSPOT_Y}px"/>
    </svg>`;

    const start = from ?? {
      x: window.innerWidth - 40,
      y: window.innerHeight - 40,
    };
    // Where the tip currently is. Each reach is sampled from here, so a
    // second one continues the hand's movement instead of restarting it.
    let at = start;
    host.style.transform = `translate(${start.x - HOTSPOT_X}px, ${start.y - HOTSPOT_Y}px)`;
    document.documentElement.appendChild(layer);

    const glyph = host.querySelector('path');
    // Read back once so the browser has the start position before the first
    // transition, or the cursor teleports instead of travelling.
    void host.offsetWidth;
    host.style.opacity = '1';

    let gone = false;
    const cursor: Cursor = {
      async moveTo(x, y) {
        if (gone) return;
        const land = `translate(${x - HOTSPOT_X}px, ${y - HOTSPOT_Y}px)`;

        if (prefersReducedMotion() || typeof host.animate !== 'function') {
          host.style.transform = land;
          return;
        }

        // The reach: bowed, minimum-jerk, landing on the target. `linear`
        // on purpose — the whole shape of the motion lives in the sampling,
        // and an easing on top would flatten it back out.
        host.style.transition = `opacity ${CURSOR_APPEAR_MS}ms ease`;
        const frames = reachFrames(at, { x, y });
        // The last frame IS the target, so the animation's held value and
        // the inline style agree and there is nothing left to correct.
        const reach = host.animate(frames, {
          duration: CURSOR_TRAVEL_MS,
          easing: 'linear',
          fill: 'forwards',
        });
        await reach.finished.catch(() => undefined);
        if (gone) return;

        host.style.transform = land;
        at = { x, y };
        await wait(CURSOR_REST_MS);
      },
      async press() {
        if (gone || !glyph) return;
        glyph.style.transform = 'scale(0.86)';
        await wait(CURSOR_PRESS_MS);
        glyph.style.transform = '';
      },
      release() {
        if (gone) return;
        gone = true;
        host.style.opacity = '0';
        window.setTimeout(() => layer.remove(), CURSOR_APPEAR_MS + 60);
      },
    };

    active = cursor;
    keepAlive();
    return cursor;
  } catch {
    // Decoration. A document that will not take it is not an error.
    return null;
  }
}

/** The point both the gesture and the real event aim at. */
export function centreOf(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Bring the control into view and walk the pointer to it.
 *
 * Every failure here is swallowed on purpose. The caller owes the waiting
 * turn an answer, and an animation that cannot run is not a reason to
 * withhold one — the work still happens, it just happens unaccompanied.
 */
export async function travelTo(
  el: HTMLElement,
  { press = false }: { press?: boolean } = {},
): Promise<{ done: () => void }> {
  const cursor = showAgentCursor();
  if (!cursor) return { done: () => {} };
  try {
    el.scrollIntoView?.({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
      inline: 'nearest',
    });
    const { x, y } = centreOf(el);
    await cursor.moveTo(x, y);
    if (press) await cursor.press();
  } catch {
    // Decoration only.
  }
  // The STEP is done, not the hand. It stays where it is and starts the
  // idle clock; another step within that window picks it up from here.
  return { done: keepAlive };
}
