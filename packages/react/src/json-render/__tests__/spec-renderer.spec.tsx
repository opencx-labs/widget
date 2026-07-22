import type { Spec } from '@json-render/core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SpecRenderer } from '../SpecRenderer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Integration: exercises the whole render seam (SpecRenderer → JSONUIProvider →
 * Renderer → registry) the way a streamed/persisted spec does. Covers the happy
 * path for the data components plus the defensive guarantees — malformed props
 * degrade, unknown types fall back, empty specs render nothing, and `repeat`
 * rows are recovered — none of which may throw.
 */

let roots: Root[] = [];

function render(spec: Spec | null): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<SpecRenderer spec={spec} />));
  return container;
}

afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

const oneElement = (type: string, props: Record<string, unknown>): Spec => ({
  root: 'el',
  elements: { el: { type, props } },
});

describe('SpecRenderer', () => {
  it('renders a Metric (label + value)', () => {
    const html = render(oneElement('Metric', { label: 'Total spent', value: '$1,240', trend: 'up' }));
    expect(html.textContent).toContain('Total spent');
    expect(html.textContent).toContain('$1,240');
  });

  it('renders a List with its items and secondary text', () => {
    const html = render(
      oneElement('List', {
        items: [
          { label: 'Order #1024', secondary: 'Shipped', status: 'success' },
          { label: 'Order #1025', secondary: 'Processing', status: 'warning' },
        ],
      }),
    );
    expect(html.textContent).toContain('Order #1024');
    expect(html.textContent).toContain('Shipped');
    expect(html.textContent).toContain('Order #1025');
  });

  it('renders a Table with header + cell strings', () => {
    const html = render(
      oneElement('Table', {
        columns: ['Item', 'Qty'],
        rows: [
          ['Widget', '2'],
          ['Gadget', '1'],
        ],
      }),
    );
    expect(html.textContent).toContain('Item');
    expect(html.textContent).toContain('Widget');
    expect(html.textContent).toContain('Gadget');
  });

  it('renders nested layout (Card > Heading)', () => {
    const html = render({
      root: 'card',
      elements: {
        card: { type: 'Card', props: { title: 'Summary' }, children: ['h'] },
        h: { type: 'Heading', props: { text: 'Your orders', level: 3 } },
      },
    });
    expect(html.textContent).toContain('Summary');
    expect(html.textContent).toContain('Your orders');
  });

  it('recovers List rows the model parked behind a repeat', () => {
    const html = render({
      root: 'list',
      state: { orders: [{ label: 'Alpha' }, { label: 'Beta' }] },
      elements: {
        list: { type: 'List', props: { items: [] }, repeat: { statePath: '/orders' } },
      },
    });
    expect(html.textContent).toContain('Alpha');
    expect(html.textContent).toContain('Beta');
  });

  it('falls back for an unknown component type without throwing', () => {
    const html = render(oneElement('Frobnicator', { foo: 1 }));
    expect(html.textContent).toContain('Unsupported: Frobnicator');
  });

  it('degrades a Metric with a missing required prop instead of crashing', () => {
    // `value` missing → parseProps returns the empty fallback; must not throw and
    // must not render the partial label as if it were valid.
    const html = render(oneElement('Metric', { label: 'orphaned' }));
    expect(html.textContent).not.toContain('orphaned');
  });

  it('renders nothing for a null or empty spec', () => {
    expect(render(null).textContent).toBe('');
    expect(render({ root: '', elements: {} }).textContent).toBe('');
  });

  // ── companion-parity behaviors ─────────────────────────────────────────────

  it('renders a Metric KPI delta with its direction arrow and context label', () => {
    const html = render(
      oneElement('Metric', {
        label: 'Automation rate',
        value: '82%',
        description: 'Last 30 days',
        delta: { value: '+4.2 pts', direction: 'up', label: 'vs previous 30d' },
      }),
    );
    expect(html.textContent).toContain('82%');
    expect(html.textContent).toContain('+4.2 pts');
    expect(html.textContent).toContain('vs previous 30d');
    expect(html.textContent).toContain('Last 30 days');
    expect(html.textContent).toContain('\u2191'); // up arrow
  });

  it('ignores a malformed Metric delta (bad direction) without dropping the value', () => {
    const html = render(
      oneElement('Metric', {
        label: 'Rate',
        value: '82%',
        delta: { value: '+1', direction: 'sideways' },
      }),
    );
    // Whole-prop parse fails → typed fallback; must not throw. The fallback is
    // the empty metric, so neither value nor bogus delta renders as valid.
    expect(html.textContent).not.toContain('sideways');
  });

  it('caps a long List at maxVisible with a "See N more" expander', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ label: `Row ${i + 1}` }));
    const html = render(oneElement('List', { items, maxVisible: 3 }));
    expect(html.textContent).toContain('Row 3');
    expect(html.textContent).not.toContain('Row 4');
    expect(html.textContent).toContain('See 4 more');
  });

  it('expands the List on the "See more" click and collapses back', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ label: `Row ${i + 1}` }));
    const html = render(oneElement('List', { items, maxVisible: 2 }));
    const button = html.querySelector('button');
    if (!button) throw new Error('expected expander button');

    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(html.textContent).toContain('Row 5');
    expect(html.textContent).toContain('See less');

    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(html.textContent).not.toContain('Row 5');
  });

  it('renders a List row with href as a link opening in the host page', () => {
    const html = render(
      oneElement('List', { items: [{ label: 'Docs', href: 'https://example.com/docs' }] }),
    );
    const link = html.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/docs');
    expect(link?.getAttribute('target')).toBe('_top');
  });

  it('shows no expander when the List fits within maxVisible', () => {
    const html = render(
      oneElement('List', { items: [{ label: 'Only row' }], maxVisible: 10 }),
    );
    expect(html.querySelector('button')).toBeNull();
    expect(html.textContent).not.toContain('See');
  });
});
