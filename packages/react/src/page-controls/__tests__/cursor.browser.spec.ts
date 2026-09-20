// The pointer, in a real browser — the only place a transform actually
// moves anything. The property that matters is not that it looks nice: it
// is that the gesture and the real event aim at the same point, and that a
// pointer that cannot be drawn never costs the turn its answer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  centreOf,
  dismissAgentCursor,
  showAgentCursor,
  travelTo,
} from '../cursor';

const cursorNode = () =>
  document.querySelector<HTMLElement>('[data-opencx-cursor]');

const target = () => {
  const el = document.querySelector<HTMLElement>('#target');
  if (!el) throw new Error('fixture needs #target');
  return el;
};

beforeEach(() => {
  document.body.style.margin = '0';
  document.body.innerHTML = `
    <button id="target" style="position:absolute;left:200px;top:140px;width:120px;height:40px">
      Cancel subscription
    </button>`;
});

afterEach(() => {
  dismissAgentCursor();
  document.body.innerHTML = '';
});

describe('the agent pointer', () => {
  it('is widget-owned and cannot intercept anything', () => {
    showAgentCursor();
    const node = cursorNode();

    expect(node).not.toBeNull();
    expect(node?.getAttribute('data-opencx-overlay')).toBe('');
    expect(node?.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(node as Element).pointerEvents).toBe('none');
    expect(getComputedStyle(node as Element).position).toBe('fixed');
  });

  it("lands on the control's centre — the same point a click aims at", async () => {
    await travelTo(target());

    const node = cursorNode();
    if (!node) throw new Error('no cursor');
    const centre = centreOf(target());
    const tip = node.getBoundingClientRect();

    // The hotspot is the tip, so the node's own origin sits a hair above
    // and left of the point it is pointing at.
    expect(Math.abs(tip.left + 2 - centre.x)).toBeLessThan(1.5);
    expect(Math.abs(tip.top + 1.7 - centre.y)).toBeLessThan(1.5);
  });

  it('reaches along a curve, not a straight line', async () => {
    const from = { x: 900, y: 700 };
    const to = { x: 200, y: 160 };
    showAgentCursor(from);
    const node = cursorNode();
    if (!node) throw new Error('no cursor');

    // Sample the tip partway in. A straight tween would put it on the line
    // between the two points; a hand swings off it.
    const moved = travelTo(target());
    await new Promise((r) => setTimeout(r, 380));
    const mid = node.getBoundingClientRect();
    await moved;

    const start = { x: 900, y: 700 };
    const end = centreOf(target());
    // Distance from the midpoint to the straight line between the ends.
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const offLine =
      Math.abs(
        dy * (mid.left + 2) -
          dx * (mid.top + 1.7) +
          end.x * start.y -
          end.y * start.x,
      ) / Math.hypot(dx, dy);

    expect(offLine).toBeGreaterThan(8);
  });

  it('only one pointer exists, however many effects arrive', async () => {
    showAgentCursor();
    showAgentCursor();
    showAgentCursor();

    expect(document.querySelectorAll('[data-opencx-cursor]')).toHaveLength(1);
  });

  it('releasing it takes it off the page', async () => {
    const cursor = await travelTo(target());
    expect(cursorNode()).not.toBeNull();

    cursor.release();
    await new Promise((r) => setTimeout(r, 400));
    expect(cursorNode()).toBeNull();
  });

  it('a control it cannot scroll to still gets travelled to', async () => {
    const el = target();
    // Some hosts replace scrollIntoView, or remove it entirely.
    Object.defineProperty(el, 'scrollIntoView', {
      value: () => {
        throw new Error('nope');
      },
      configurable: true,
    });

    // Resolves rather than rejecting: the caller owes the turn an answer,
    // and decoration is never a reason to withhold one.
    await expect(travelTo(el, { press: true })).resolves.toBeDefined();
  });
});
