import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ language: 'en' }),
  useDocumentDir: () => ({ dir: 'ltr' }),
}));

import ChartImpl from '../Chart.impl';
import { estimateTextWidth, requiredYAxisWidth } from '../chart-axis';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * The Y axis must be as wide as its painted tick labels. recharts 2.x sizes
 * `YAxis` from a fixed `width`; a label wider than the room left of its tick
 * pokes out past the svg's left edge and the viewport clips it — which is how
 * a 120/80/150/90/200 bar chart showed "0" for every tick in the 400px chat
 * panel (only the last digit survived).
 *
 * jsdom lays nothing out, so the assertions are geometric: every Y tick label
 * is anchored at its right edge (`text-anchor: end`) at attribute `x`, so the
 * label fits iff `x >= labelWidth`. jsdom has no `getComputedTextLength`, so
 * the estimate is the width model here; one test fakes the browser measurement
 * to prove the measured path drives the axis when it is available.
 */

const Y_TICK_FONT_SIZE = 11;
/** The fixed `YAxis.width` the chart shipped with — the ceiling a small-number
 * axis must stay under, or the fix wastes plot width. */
const LEGACY_FIXED_AXIS_WIDTH = 32;

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;

// recharts skips rendering entirely at zero width; jsdom reports 0 for everything.
let containerWidth = 400;
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    return containerWidth;
  },
});

let roots: Root[] = [];

function render(el: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(el));
  return container;
}

beforeEach(() => {
  containerWidth = 400;
});

afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

type YTick = { label: string; x: number };

/** Every Y tick recharts painted: its text and the x its right edge sits at. */
function yTicks(c: HTMLElement): YTick[] {
  return Array.from(
    c.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value'),
    (n) => ({ label: n.textContent ?? '', x: Number(n.getAttribute('x')) }),
  );
}

/** Where the plot starts: the left end of the horizontal grid lines. */
function plotLeft(c: HTMLElement): number {
  const line = c.querySelector('.recharts-cartesian-grid-horizontal line');
  if (!line) throw new Error('no horizontal grid line painted');
  return Number(line.getAttribute('x1'));
}

function chart(type: 'bar' | 'line', values: number[]) {
  return (
    <ChartImpl
      type={type}
      data={values.map((value, i) => ({ label: `d${i}`, value }))}
      height={220}
      title={null}
      centerLabel={null}
    />
  );
}

/** Asserts every painted Y label fits left of its anchor under `widthOf`. */
function expectLabelsFit(ticks: YTick[], widthOf: (label: string) => number) {
  expect(ticks.length).toBeGreaterThan(1);
  for (const tick of ticks) {
    expect(
      tick.x,
      `label "${tick.label}" anchored at x=${tick.x} needs ${widthOf(tick.label)}px`,
    ).toBeGreaterThanOrEqual(widthOf(tick.label));
  }
}

const estimate = (label: string) => estimateTextWidth(label, Y_TICK_FONT_SIZE);

describe('Chart Y axis width', () => {
  it('fits the report values that clipped (120/80/150/90/200 → "200" tick)', () => {
    const c = render(chart('bar', [120, 80, 150, 90, 200]));
    const ticks = yTicks(c);
    // Positive control: recharts really painted the three-digit top tick.
    expect(ticks.map((t) => t.label)).toContain('200');
    expectLabelsFit(ticks, estimate);
  });

  it.each(['bar', 'line'] as const)(
    'fits 7-digit tick labels in the 400px chat panel (%s)',
    (type) => {
      const c = render(
        chart(type, [1_200_000, 800_000, 5_400_000, 900_000, 7_000_000]),
      );
      const ticks = yTicks(c);
      // Positive control: a full 7-digit label is what recharts painted —
      // the fix must make room for it, not shorten it.
      expect(ticks.some((t) => /^\d{7}$/.test(t.label))).toBe(true);
      expectLabelsFit(ticks, estimate);
    },
  );

  it('holds at the inbox width too (720px)', () => {
    containerWidth = 720;
    const c = render(chart('bar', [1_200_000, 5_400_000, 7_000_000]));
    const ticks = yTicks(c);
    expect(ticks.some((t) => /^\d{7}$/.test(t.label))).toBe(true);
    expectLabelsFit(ticks, estimate);
  });

  it('does not waste plot width on small numbers (positive control)', () => {
    // 4/8/6 ticks as 0,2,4,6,8: single-character labels.
    const small = render(chart('bar', [4, 8, 6]));
    const large = render(chart('bar', [1_200_000, 5_400_000, 7_000_000]));
    const smallTicks = yTicks(small);
    expect(smallTicks.map((t) => t.label)).toEqual(['0', '2', '4', '6', '8']);
    expectLabelsFit(smallTicks, estimate);
    // One- and two-character labels need a narrower axis than the old fixed
    // 32px, and a narrower one than 7-digit labels: the axis tracks the labels.
    expect(plotLeft(small)).toBeLessThan(LEGACY_FIXED_AXIS_WIDTH);
    expect(plotLeft(small)).toBeLessThan(plotLeft(large));
  });

  it('sizes from the browser measurement when the text can be measured', () => {
    // A browser reports the real glyph run through `getComputedTextLength`;
    // fake one that is far wider than the estimate (a currency-formatted
    // label in a wide font) and require the axis to follow IT.
    const perChar = 9;
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value(this: SVGElement) {
        return (this.textContent ?? '').length * perChar;
      },
    });
    try {
      const c = render(chart('bar', [120, 80, 150, 90, 200]));
      const ticks = yTicks(c);
      expect(ticks.map((t) => t.label)).toContain('200');
      const measured = (label: string) => label.length * perChar;
      expectLabelsFit(ticks, measured);
      // Discriminates measured from estimated: the estimate alone would have
      // left the axis too narrow for the measured "200".
      expect(measured('200')).toBeGreaterThan(estimate('200'));
    } finally {
      Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
    }
  });

  it('leaves a pie (no Y axis) alone', () => {
    const c = render(
      <ChartImpl
        type="pie"
        data={[{ label: 'a', value: 1_000_000 }]}
        height={220}
        title={null}
        centerLabel={null}
      />,
    );
    expect(c.querySelector('.recharts-pie')).toBeTruthy();
    expect(yTicks(c)).toEqual([]);
  });
});

describe('requiredYAxisWidth', () => {
  it('returns null with no Y ticks in the DOM', () => {
    const c = document.createElement('div');
    c.innerHTML = '<svg><g class="recharts-yAxis"></g></svg>';
    expect(requiredYAxisWidth(c, 32, Y_TICK_FONT_SIZE)).toBeNull();
  });

  it('derives the width from the widest label plus the gap the axis keeps right of it', () => {
    const c = document.createElement('div');
    // Two ticks anchored at x=24 inside a 32px axis: the axis reserves 8px
    // right of the label. Whatever that gap is, it must survive the resize.
    c.innerHTML = `<svg><g class="recharts-yAxis">
      <text class="recharts-cartesian-axis-tick-value" x="24">0</text>
      <text class="recharts-cartesian-axis-tick-value" x="24">1000000</text>
    </g></svg>`;
    const widest = estimate('1000000');
    const gap = 32 - 24;
    const needed = requiredYAxisWidth(c, 32, Y_TICK_FONT_SIZE);
    expect(needed).not.toBeNull();
    expect(needed).toBeGreaterThanOrEqual(Math.ceil(widest + gap));
    // Tight: no more than a couple of px of slack past the label.
    expect(needed).toBeLessThanOrEqual(Math.ceil(widest + gap) + 3);
  });

  it('ignores ticks without a numeric anchor', () => {
    const c = document.createElement('div');
    c.innerHTML = `<svg><g class="recharts-yAxis">
      <text class="recharts-cartesian-axis-tick-value">1000000</text>
    </g></svg>`;
    expect(requiredYAxisWidth(c, 32, Y_TICK_FONT_SIZE)).toBeNull();
  });
});

describe('estimateTextWidth', () => {
  it('scales with the label and the font size, and is zero for an empty label', () => {
    expect(estimate('')).toBe(0);
    expect(estimate('1000000')).toBeGreaterThan(estimate('200'));
    expect(estimateTextWidth('200', 22)).toBeGreaterThan(estimate('200'));
  });
});
