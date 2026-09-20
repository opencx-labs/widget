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
 * Widget-owned, `pointer-events: none`, `position: fixed`. It never touches
 * a customer element and never intercepts a click.
 */

const TRAVEL_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const CURSOR_APPEAR_MS = 220;
/** The long haul. A hand crossing a dashboard takes about this. */
export const CURSOR_TRAVEL_MS = 1150;
/** The corrective flick at the end — humans overshoot and come back. */
export const CURSOR_SETTLE_MS = 190;
/** A hand stops before it presses; without this the two moves read as one jerk. */
export const CURSOR_REST_MS = 180;
export const CURSOR_PRESS_MS = 240;

/**
 * How far the path bows out of the straight line, as a fraction of the
 * distance travelled. A hand swings; a tween slides. Zero here is the thing
 * that made the first version read as a sprite on a rail.
 */
const ARC = 0.13;

/** How far past the target the first movement lands, before correcting. */
const OVERSHOOT = 0.028;

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
 * The keyframes for one reach: a bowed path, sampled on a minimum-jerk
 * clock, aiming slightly past the target. The correction back onto it is a
 * second, much shorter movement — which is what a hand does, and what makes
 * the arrival read as deliberate rather than as a slide coming to rest.
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
  const past = {
    x: to.x + (dx / distance) * distance * OVERSHOOT,
    y: to.y + (dy / distance) * distance * OVERSHOOT,
  };

  const frames: { transform: string }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const point = onCurve(from, control, past, minimumJerk(i / steps));
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

/** One at a time: a second effect takes the pointer from the first. */
let active: Cursor | null = null;

/**
 * Take the pointer off the page NOW.
 *
 * `release` fades, which is right at the end of an effect and wrong when a
 * new effect is starting: the fade outlives the call, so three effects in
 * quick succession left three ghosts drifting behind the live one. Anything
 * still carrying the marker is removed outright here.
 */
export function dismissAgentCursor(): void {
  active?.release();
  active = null;
  document
    .querySelectorAll('[data-opencx-cursor]')
    .forEach((stale) => stale.remove());
}

/**
 * Put a pointer on the page at a starting point. Returns null when the
 * document will not have it — the caller then does its own thing silently,
 * because a missing animation must never stop the actual work.
 */
export function showAgentCursor(from?: {
  x: number;
  y: number;
}): Cursor | null {
  try {
    dismissAgentCursor();

    const host = document.createElement('div');
    host.setAttribute('data-opencx-overlay', '');
    // Its own marker as well as the shared one: the ink and the pointer are
    // both widget overlays, and anything reasoning about "is the mark still
    // up" needs to tell them apart.
    host.setAttribute('data-opencx-cursor', '');
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '14px',
      height: '14px',
      zIndex: '2147483646',
      pointerEvents: 'none',
      opacity: '0',
      transition: `opacity ${CURSOR_APPEAR_MS}ms ease`,
      willChange: 'transform',
    } satisfies Partial<CSSStyleDeclaration>);

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
    document.documentElement.appendChild(host);

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

        // The reach: bowed, minimum-jerk, ending just past the target.
        // `linear` on purpose — the whole shape of the motion lives in the
        // sampling, and an easing on top would flatten it back out.
        host.style.transition = `opacity ${CURSOR_APPEAR_MS}ms ease`;
        const reach = host.animate(reachFrames(at, { x, y }), {
          duration: CURSOR_TRAVEL_MS,
          easing: 'linear',
          fill: 'forwards',
        });
        await reach.finished.catch(() => undefined);
        if (gone) return;

        // The correction: short, and onto the target exactly.
        const settle = host.animate([{}, { transform: land }], {
          duration: CURSOR_SETTLE_MS,
          easing: TRAVEL_EASE,
          fill: 'forwards',
        });
        await settle.finished.catch(() => undefined);
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
        window.setTimeout(() => host.remove(), CURSOR_APPEAR_MS + 60);
      },
    };

    active = cursor;
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
): Promise<{ release: () => void }> {
  const cursor = showAgentCursor();
  if (!cursor) return { release: () => {} };
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
  return { release: () => cursor.release() };
}
