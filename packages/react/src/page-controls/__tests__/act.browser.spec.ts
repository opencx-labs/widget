// Acting on a customer's page, in a real browser — because every claim here
// is about what a browser actually does: whether a component library's
// dropdown opens, whether React keeps a typed value, whether a click that
// went nowhere can be told apart from one that worked.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actOnPage } from '../act';
import { beginSnapshot, resetRefsForTest } from '../control-ref';

const mount = (html: string) => {
  document.body.innerHTML = html;
};

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

describe('clicking', () => {
  it('fires the whole pointer sequence, so a menu built on pointerdown opens', async () => {
    mount(`
      <button id="menu" style="width:120px;height:32px">Open menu</button>
      <div id="out"></div>
    `);
    const seen: string[] = [];
    const menu = document.getElementById('menu');
    for (const type of [
      'pointerover',
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'click',
    ]) {
      menu?.addEventListener(type, () => seen.push(type));
    }
    // A component library's dropdown: it opens on pointerdown, not click.
    menu?.addEventListener('pointerdown', () => {
      const out = document.getElementById('out');
      if (out) out.textContent = 'menu open';
    });

    const result = await actOnPage({
      ref: refFor('#menu'),
      action: 'click',
      settleMs: 200,
    });

    expect(seen).toEqual([
      'pointerover',
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'click',
    ]);
    expect(result.outcome).toBe('done');
    expect(document.getElementById('out')?.textContent).toBe('menu open');
  });

  it('a click that changes nothing is reported as changing nothing', async () => {
    mount(
      `<button id="inert" style="width:120px;height:32px">Does nothing</button>`,
    );

    const result = await actOnPage({
      ref: refFor('#inert'),
      action: 'click',
      settleMs: 200,
    });

    expect(result.outcome).toBe('no_change');
    expect(result.detail).toContain('nothing on the page changed');
  });

  it('moves focus before the release, like a real press', async () => {
    mount(`<button id="go" style="width:80px;height:32px">Go</button>`);
    await actOnPage({ ref: refFor('#go'), action: 'click', settleMs: 100 });

    expect(document.activeElement?.id).toBe('go');
  });
});

describe('typing', () => {
  it('writes through the native setter, so a framework-tracked field keeps it', async () => {
    mount(`<input id="email" style="width:200px;height:28px" />`);
    const input = document.querySelector<HTMLInputElement>('#email');
    const events: string[] = [];
    input?.addEventListener('input', () => events.push('input'));
    input?.addEventListener('change', () => events.push('change'));

    const result = await actOnPage({
      ref: refFor('#email'),
      action: 'fill',
      value: 'ada@example.com',
      settleMs: 100,
    });

    expect(result.outcome).toBe('done');
    expect(input?.value).toBe('ada@example.com');
    // Both events, in the order a real edit produces them.
    expect(events).toEqual(['input', 'change']);
  });

  it('a field that refuses what was typed is reported as no change', async () => {
    mount(`<input id="locked" style="width:200px;height:28px" />`);
    const input = document.querySelector<HTMLInputElement>('#locked');
    // A controlled field that always snaps back — the shape of a React
    // input whose state never accepted the new value.
    input?.addEventListener('input', () => {
      if (input) input.value = '';
    });

    const result = await actOnPage({
      ref: refFor('#locked'),
      action: 'fill',
      value: 'hello',
      settleMs: 100,
    });

    expect(result.outcome).toBe('no_change');
    expect(result.detail).toContain('did not keep');
  });

  it('never types into a password or a file field', async () => {
    mount(`
      <input id="pw" type="password" style="width:200px;height:28px" />
      <input id="cv" type="file" style="width:200px;height:28px" />
    `);

    for (const selector of ['#pw', '#cv']) {
      const result = await actOnPage({
        ref: refFor(selector),
        action: 'fill',
        value: 'secret',
        settleMs: 50,
      });
      expect(result.outcome).toBe('unsupported');
      expect(result.detail).toContain('never filled');
    }
    expect(document.querySelector<HTMLInputElement>('#pw')?.value).toBe('');
  });
});

describe('dropdowns and switches', () => {
  it('chooses an option by its value or by what it says', async () => {
    mount(`
      <select id="plan" style="width:160px;height:28px">
        <option value="m">Monthly</option>
        <option value="y">Yearly</option>
      </select>
    `);
    const select = document.querySelector<HTMLSelectElement>('#plan');

    expect(
      (
        await actOnPage({
          ref: refFor('#plan'),
          action: 'select',
          value: 'Yearly',
          settleMs: 100,
        })
      ).outcome,
    ).toBe('done');
    expect(select?.value).toBe('y');
  });

  it('an option that is not in the list changes nothing and says so', async () => {
    mount(`
      <select id="plan" style="width:160px;height:28px">
        <option value="m">Monthly</option>
      </select>
    `);

    const result = await actOnPage({
      ref: refFor('#plan'),
      action: 'select',
      value: 'Quarterly',
      settleMs: 50,
    });

    expect(result.outcome).toBe('no_change');
    expect(result.detail).toContain('not in the list');
    expect(document.querySelector<HTMLSelectElement>('#plan')?.value).toBe('m');
  });

  it('turns a checkbox on, and says so when it was already on', async () => {
    mount(`<input id="opt" type="checkbox" style="width:16px;height:16px" />`);
    const ref = refFor('#opt');

    expect(
      (await actOnPage({ ref, action: 'check', settleMs: 100 })).outcome,
    ).toBe('done');
    expect(document.querySelector<HTMLInputElement>('#opt')?.checked).toBe(
      true,
    );

    const again = await actOnPage({ ref, action: 'check', settleMs: 50 });
    expect(again.outcome).toBe('no_change');
    expect(again.detail).toContain('already on');
  });

  it('reads an aria switch by its state, not by its markup', async () => {
    mount(`
      <div id="live" role="switch" aria-checked="false" style="width:48px;height:24px">Live mode</div>
    `);
    const live = document.getElementById('live');
    live?.addEventListener('click', () =>
      live.setAttribute('aria-checked', 'true'),
    );

    const result = await actOnPage({
      ref: refFor('#live'),
      action: 'check',
      settleMs: 200,
    });

    expect(result.outcome).toBe('done');
    expect(live?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('what it refuses', () => {
  it('will not act through a reference that no longer resolves', async () => {
    mount(`<button id="go" style="width:80px;height:32px">Go</button>`);
    const ref = refFor('#go');
    // Positive control: it acts while the control is there.
    expect(
      (await actOnPage({ ref, action: 'click', settleMs: 50 })).outcome,
    ).not.toBe('gone');

    document.getElementById('go')?.remove();
    expect(await actOnPage({ ref, action: 'click', settleMs: 50 })).toEqual({
      outcome: 'gone',
    });
  });

  it('will not act on a control something is drawn over', async () => {
    mount(`
      <button id="pay" style="position:absolute;left:40px;top:40px;width:120px;height:40px">Pay</button>
      <div style="position:fixed;inset:0;z-index:10"></div>
    `);

    expect(
      await actOnPage({ ref: refFor('#pay'), action: 'click', settleMs: 50 }),
    ).toEqual({
      outcome: 'covered',
    });
  });

  it('will not type into something that is not a field', async () => {
    mount(`<button id="go" style="width:80px;height:32px">Go</button>`);

    const result = await actOnPage({
      ref: refFor('#go'),
      action: 'fill',
      value: 'x',
      settleMs: 50,
    });

    expect(result.outcome).toBe('unsupported');
  });
});
