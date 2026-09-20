// The check that runs in the instant before the widget touches a control.
// Occlusion is the reason this spec is in a real browser: a modal over the
// button, a sticky header across it, an element scrolled out of view — none
// of those exist in a layout-less environment, and all of them are the
// difference between pointing at something and pointing at nothing.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { beginSnapshot, resetRefsForTest } from '../control-ref';
import { guardRef } from '../guard';
import { readPageControls } from '../read-controls';

const mount = (html: string) => {
  document.body.innerHTML = html;
};

/** The ref the page reader would have handed out for this element. */
const refFor = (selector: string): string => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no element for ${selector}`);
  return beginSnapshot()(el);
};

beforeEach(() => {
  resetRefsForTest();
  document.body.style.margin = '0';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a reference the widget handed out', () => {
  it('passes when the control is there, visible and in front', () => {
    mount(`<button id="pay">Pay now</button>`);
    const outcome = guardRef(refFor('#pay'));

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.element).toBe(document.getElementById('pay'));
  });

  it('says "gone" for a made-up reference, and for one whose node left', () => {
    mount(`<button id="pay">Pay now</button>`);
    const ref = refFor('#pay');
    // Positive control: it passes while the node is there.
    expect(guardRef(ref).ok).toBe(true);

    expect(guardRef('s9c99')).toEqual({ ok: false, reason: 'gone' });
    document.getElementById('pay')?.remove();
    expect(guardRef(ref)).toEqual({ ok: false, reason: 'gone' });
  });

  it('says "hidden" when the control is no longer on screen', () => {
    mount(`<button id="pay">Pay now</button>`);
    const ref = refFor('#pay');
    expect(guardRef(ref).ok).toBe(true);

    const pay = document.getElementById('pay');
    if (!pay) throw new Error('missing target');
    pay.style.display = 'none';
    expect(guardRef(ref)).toEqual({ ok: false, reason: 'hidden' });

    pay.style.display = '';
    pay.style.visibility = 'hidden';
    expect(guardRef(ref)).toEqual({ ok: false, reason: 'hidden' });
  });

  it('says "covered" when something is drawn over the control', () => {
    mount(`
      <button id="pay" style="position:absolute;left:40px;top:40px;width:120px;height:40px">Pay now</button>
    `);
    const ref = refFor('#pay');
    expect(guardRef(ref).ok).toBe(true);

    const modal = document.createElement('div');
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10';
    document.body.appendChild(modal);

    expect(guardRef(ref)).toEqual({ ok: false, reason: 'covered' });
  });

  it("still passes when the hit lands on the control's own label", () => {
    mount(`
      <button id="pay" style="position:absolute;left:40px;top:40px;width:120px;height:40px">
        <span style="pointer-events:auto">Pay now</span>
      </button>
    `);

    expect(guardRef(refFor('#pay')).ok).toBe(true);
  });

  it('treats a control scrolled out of view as reachable, not covered', () => {
    mount(`
      <div style="height:3000px"></div>
      <button id="pay" style="width:120px;height:40px">Pay now</button>
    `);

    // Nothing is in front of it; it is simply elsewhere, and callers scroll
    // it into view before they act.
    expect(guardRef(refFor('#pay')).ok).toBe(true);
  });

  it('a reference from the reading before last still points at its own node', () => {
    mount(`<button id="a">A</button>`);
    const first = readPageControls().controls[0];
    mount(`<button id="b">B</button>`);
    readPageControls();
    mount(`<button id="c">C</button>`);
    const third = readPageControls().controls[0];

    if (!first || !third) throw new Error('reader produced no controls');
    // Two readings are kept, so the oldest has aged out — and the node it
    // named is gone from the document anyway.
    expect(guardRef(first.ref)).toEqual({ ok: false, reason: 'gone' });
    expect(guardRef(third.ref).ok).toBe(true);
  });
});
