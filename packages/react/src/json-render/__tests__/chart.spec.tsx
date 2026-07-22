import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import ChartImpl from '../Chart.impl';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Guards the recharts/React-19 seam. recharts <2.15 declared component defaults
 * via `defaultProps` on FUNCTION components (`XAxis`, `YAxis`, `CartesianGrid`,
 * …) and read `Bar.defaultProps.minPointSize` back off the element. React 19
 * dropped `defaultProps` for function components, so every one of those defaults
 * arrived `undefined`: bar charts threw `minPointSize is not a function` and
 * line charts rendered their axes unpositioned. Neither is caught by an
 * "svg exists" assertion, so these tests assert the *parts* — axis ticks, grid,
 * bars/curve — that only appear when the defaults resolve.
 */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;

// recharts skips rendering entirely at zero width; jsdom reports 0 for everything.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    return 400;
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

afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
});

const data = [
  { label: 'Mon', value: 10 },
  { label: 'Tue', value: 20 },
  { label: 'Wed', value: 15 },
];

/** Tick labels recharts actually painted, in DOM order. */
function tickLabels(c: HTMLElement): string[] {
  return Array.from(
    c.querySelectorAll('.recharts-cartesian-axis-tick-value'),
    (n) => n.textContent ?? '',
  );
}

describe('Chart', () => {
  it('renders a bar per datum, with axes and grid', () => {
    const c = render(
      <ChartImpl type="bar" data={data} height={220} title={null} centerLabel={null} />,
    );

    expect(c.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(data.length);
    expect(c.querySelector('.recharts-cartesian-grid')).toBeTruthy();
    // XAxis defaults must resolve for the category ticks to be laid out at all.
    expect(tickLabels(c)).toEqual(expect.arrayContaining(['Mon', 'Tue', 'Wed']));
  });

  it('renders a line with axes and grid', () => {
    const c = render(
      <ChartImpl type="line" data={data} height={220} title={null} centerLabel={null} />,
    );

    expect(c.querySelector('.recharts-line-curve')).toBeTruthy();
    expect(c.querySelector('.recharts-cartesian-grid')).toBeTruthy();
    expect(tickLabels(c)).toEqual(expect.arrayContaining(['Mon', 'Tue', 'Wed']));
  });

  // The sectors themselves mount on the first animation frame, which jsdom never
  // runs — the legend is the stable proxy for "the pie resolved its data".
  it('renders a legend entry per datum plus the center label', () => {
    const c = render(
      <ChartImpl type="pie" data={data} height={220} title={null} centerLabel="EUR 976" />,
    );

    expect(c.querySelector('.recharts-pie')).toBeTruthy();
    expect(c.querySelectorAll('.recharts-legend-item')).toHaveLength(data.length);
    expect(c.textContent).toContain('EUR 976');
  });

  it('degrades to an empty state with no data', () => {
    const c = render(
      <ChartImpl type="bar" data={[]} height={220} title={null} centerLabel={null} />,
    );

    expect(c.querySelector('svg')).toBeNull();
    expect(c.textContent).toContain('No data to chart');
  });
});
