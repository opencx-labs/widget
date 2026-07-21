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
});
