// The accuracy gate, measured rather than asserted case by case.
//
// Two rates over a synthetic customer site, in Chromium, and one invariant
// that is not a rate at all:
//
//   - actions succeed on supported controls: ≥90%
//   - highlights land on supported controls:  ≥90%
//   - a claimed success that did not happen:  0, always
//
// The third is the one that decides whether any of this can ship. A rate of
// 96% on the first two with one false "done" in the set is a fail, because
// the failure mode is an agent telling somebody their subscription is
// cancelled when it is not.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actOnPage } from '../act';
import { accessibleName } from '../accessible-name';
import { beginSnapshot, resetRefsForTest } from '../control-ref';
import { guardRef } from '../guard';
import { readPageControls } from '../read-controls';
import { ACTION_CASES } from './fixtures/synthetic-site';

const GATE = 0.9;

beforeEach(() => {
  resetRefsForTest();
  document.body.style.margin = '0';
  window.location.hash = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

function mountCase(html: string, setup?: (target: HTMLElement) => void) {
  document.body.innerHTML = html;
  const target = document.querySelector<HTMLElement>('#target');
  if (!target) throw new Error('every case needs one #target');
  setup?.(target);
  return target;
}

/** A line per case, so a failure names the control rather than an index. */
function report(
  title: string,
  rows: Array<{ name: string; ok: boolean; note?: string }>,
) {
  const passed = rows.filter((row) => row.ok).length;
  const rate = rows.length === 0 ? 0 : passed / rows.length;
  const failures = rows
    .filter((row) => !row.ok)
    .map((row) => `  ✗ ${row.name}${row.note ? ` — ${row.note}` : ''}`)
    .join('\n');
  return {
    rate,
    summary: `${title}: ${passed}/${rows.length} (${(rate * 100).toFixed(1)}%)${
      failures ? `\n${failures}` : ''
    }`,
  };
}

describe('accuracy gate on a synthetic customer site', () => {
  const supported = ACTION_CASES.filter((c) => c.supported);
  const unsupported = ACTION_CASES.filter((c) => !c.supported);

  it(`acts successfully on at least ${GATE * 100}% of supported controls`, async () => {
    const rows: Array<{ name: string; ok: boolean; note?: string }> = [];

    for (const testCase of supported) {
      resetRefsForTest();
      const target = mountCase(testCase.html, testCase.setup);
      const ref = beginSnapshot()(target);

      const result = await actOnPage({
        ref,
        action: testCase.action,
        value: testCase.value,
        settleMs: 300,
      });
      // The page is the witness, not the return value.
      const happened = testCase.didHappen(target);
      rows.push({
        name: testCase.name,
        ok: result.outcome === 'done' && happened,
        note: `outcome=${result.outcome} page=${happened ? 'changed' : 'unchanged'}${
          result.detail ? ` (${result.detail})` : ''
        }`,
      });
      document.body.innerHTML = '';
    }

    const { rate, summary } = report('actions', rows);

    console.log(summary);
    expect(rate, summary).toBeGreaterThanOrEqual(GATE);
  });

  it('never reports a success that did not happen — no rate, no exceptions', async () => {
    const lies: string[] = [];

    for (const testCase of ACTION_CASES) {
      resetRefsForTest();
      const target = mountCase(testCase.html, testCase.setup);
      const ref = beginSnapshot()(target);

      const result = await actOnPage({
        ref,
        action: testCase.action,
        value: testCase.value,
        settleMs: 300,
      });
      if (result.outcome === 'done' && !testCase.didHappen(target)) {
        lies.push(`${testCase.name}: said "done" and the page did not change`);
      }
      // A refused control must also be untouched, not merely unclaimed.
      if (!testCase.supported && testCase.didHappen(target)) {
        lies.push(`${testCase.name}: was operated despite being unsupported`);
      }
      document.body.innerHTML = '';
    }

    expect(lies, lies.join('\n')).toEqual([]);
  });

  it('refuses every control it does not support, rather than failing quietly', async () => {
    const rows: Array<{ name: string; ok: boolean; note?: string }> = [];

    for (const testCase of unsupported) {
      resetRefsForTest();
      const target = mountCase(testCase.html, testCase.setup);
      const ref = beginSnapshot()(target);

      const result = await actOnPage({
        ref,
        action: testCase.action,
        value: testCase.value,
        settleMs: 100,
      });
      rows.push({
        name: testCase.name,
        ok: result.outcome === 'unsupported',
        note: `outcome=${result.outcome}`,
      });
      document.body.innerHTML = '';
    }

    const { rate, summary } = report('refusals', rows);
    expect(rate, summary).toBe(1);
  });

  it('offers exactly the controls it claims to, and no others', () => {
    const rows: Array<{ name: string; ok: boolean; note?: string }> = [];

    for (const testCase of ACTION_CASES) {
      resetRefsForTest();
      const target = mountCase(testCase.html, testCase.setup);
      const expected = testCase.offeredByReader ?? testCase.supported;
      const named = accessibleName(target);
      const offered = readPageControls().controls.some(
        (control) => control.name === named && named !== '',
      );
      rows.push({
        name: testCase.name,
        ok: offered === expected,
        note: offered ? `offered as "${named}"` : 'not offered',
      });
      document.body.innerHTML = '';
    }

    const { rate, summary } = report('reader', rows);
    expect(rate, summary).toBe(1);
  });

  it(`points at at least ${GATE * 100}% of supported controls`, () => {
    const rows: Array<{ name: string; ok: boolean; note?: string }> = [];

    for (const testCase of supported) {
      resetRefsForTest();
      const target = mountCase(testCase.html, testCase.setup);
      // The whole path the agent uses: the reader offers it, the agent
      // names it by ref, the guard clears it for drawing.
      const snapshot = readPageControls();
      const named = accessibleName(target);
      const offered = snapshot.controls.find(
        (control) => control.name === named,
      );
      if (!offered) {
        rows.push({
          name: testCase.name,
          ok: false,
          note: `the reader never offered it (name "${named}")`,
        });
        document.body.innerHTML = '';
        continue;
      }
      const guarded = guardRef(offered.ref);
      rows.push({
        name: testCase.name,
        ok: guarded.ok && guarded.element === target,
        note: guarded.ok
          ? 'resolved to a different element'
          : `guard said ${guarded.reason}`,
      });
      document.body.innerHTML = '';
    }

    const { rate, summary } = report('highlights', rows);

    console.log(summary);
    expect(rate, summary).toBeGreaterThanOrEqual(GATE);
  });
});
