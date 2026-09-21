import type { Spec } from '@json-render/core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ anchorTarget: '_blank', language: 'en' }),
  useDocumentDir: () => ({ dir: 'ltr' }),
}));

import { SpecRenderer } from '../SpecRenderer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Guard 3: while a spec is still streaming (`active`), a container whose
 * content has not landed yet shows the shimmer the lazy Chart already uses
 * — never a bare frame or an "empty" message that flips to content a moment
 * later. Once the turn settles, the same spec renders its ordinary empty
 * state (or nothing), so a settled transcript never pulses.
 */

let roots: Root[] = [];

function mount(spec: Spec, active: boolean) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const render = (next: boolean) =>
    act(() => root.render(<SpecRenderer spec={spec} active={next} />));
  render(active);
  return { container, render };
}

afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

const shimmer = (c: HTMLElement) => c.querySelector('.animate-pulse');

const one = (
  type: string,
  props: Record<string, unknown>,
  children?: string[],
): Spec => ({
  root: 'el',
  elements: { el: { type, props, ...(children ? { children } : {}) } },
});

describe('SpecRenderer streaming shimmer', () => {
  it('shows the shimmer inside an active empty Card and drops it once settled', () => {
    const { container, render } = mount(
      one('Card', { title: 'Orders' }, []),
      true,
    );
    expect(container.textContent).toContain('Orders');
    expect(shimmer(container)).not.toBeNull();

    render(false);
    // Positive control: the card frame is still there, only the pulse is gone.
    expect(container.textContent).toContain('Orders');
    expect(shimmer(container)).toBeNull();
  });

  it('never shows the shimmer for a settled empty Card', () => {
    const { container } = mount(one('Card', { title: 'Orders' }, []), false);
    expect(container.textContent).toContain('Orders');
    expect(shimmer(container)).toBeNull();
  });

  it('treats a Card whose child element has not arrived yet as empty', () => {
    // The container's own patch names its children before their patches land;
    // the renderer emits `null` for the missing key — that is still "empty".
    const { container } = mount(one('Card', { title: 'Orders' }, ['m']), true);
    expect(shimmer(container)).not.toBeNull();
  });

  it('prefers content over the shimmer once a child has landed, even while active', () => {
    const { container } = mount(
      {
        root: 'card',
        elements: {
          card: { type: 'Card', props: { title: 'Orders' }, children: ['m'] },
          m: { type: 'Metric', props: { label: 'Total', value: '$42' } },
        },
      },
      true,
    );
    expect(container.textContent).toContain('$42');
    expect(shimmer(container)).toBeNull();
  });

  it('List: shimmer while active and empty, "No items" once settled', () => {
    const { container, render } = mount(one('List', { items: [] }), true);
    expect(shimmer(container)).not.toBeNull();
    expect(container.textContent).not.toContain('No items');

    render(false);
    expect(shimmer(container)).toBeNull();
    expect(container.textContent).toContain('No items');
  });

  it('Table: shimmer while active with no rows (header-only), header once settled', () => {
    const { container, render } = mount(
      one('Table', { columns: ['Item', 'Qty'], rows: [] }),
      true,
    );
    expect(shimmer(container)).not.toBeNull();
    expect(container.textContent).not.toContain('Item');

    render(false);
    expect(shimmer(container)).toBeNull();
    expect(container.textContent).toContain('Item');
  });

  it('Table: settled with no columns shows "No data", never the shimmer', () => {
    const { container } = mount(one('Table', { columns: [], rows: [] }), false);
    expect(shimmer(container)).toBeNull();
    expect(container.textContent).toContain('No data');
  });

  it('Table: rows present render immediately even while active', () => {
    const { container } = mount(
      one('Table', { columns: ['Item'], rows: [['Widget']] }),
      true,
    );
    expect(container.textContent).toContain('Widget');
    expect(shimmer(container)).toBeNull();
  });

  it.each(['Stack', 'Grid'] as const)(
    '%s: shimmer while active and empty, nothing once settled',
    (type) => {
      const { container, render } = mount(one(type, {}, []), true);
      expect(shimmer(container)).not.toBeNull();

      render(false);
      expect(shimmer(container)).toBeNull();
      expect(container.textContent).toBe('');
    },
  );

  it('defaults to settled: no `active` means no shimmer', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() =>
      root.render(<SpecRenderer spec={one('Card', { title: 'Orders' }, [])} />),
    );
    expect(container.textContent).toContain('Orders');
    expect(shimmer(container)).toBeNull();
  });
});
