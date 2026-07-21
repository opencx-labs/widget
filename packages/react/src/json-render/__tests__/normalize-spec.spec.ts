import type { Spec } from '@json-render/core';
import { describe, expect, it } from 'vitest';
import { inlineRepeatLeaves } from '../normalize-spec';

/**
 * Defense layer: the model parks List rows in `state` behind a `repeat`;
 * `inlineRepeatLeaves` recovers them so the list isn't an invisible empty box.
 */
describe('inlineRepeatLeaves', () => {
  it('inlines a List repeat from state and drops the repeat', () => {
    const spec: Spec = {
      root: 'list',
      state: { orders: [{ label: 'A' }, { label: 'B' }] },
      elements: {
        list: { type: 'List', props: { items: [] }, repeat: { statePath: '/orders' } },
      },
    };

    const out = inlineRepeatLeaves(spec);
    const el = out.elements.list;
    if (!el) throw new Error('expected recovered list element');

    expect(el.props).toEqual({ items: [{ label: 'A' }, { label: 'B' }] });
    expect(el.repeat).toBeUndefined();
  });

  it('is a no-op (same reference) when the List already has items', () => {
    const spec: Spec = {
      root: 'list',
      state: { orders: [{ label: 'X' }] },
      elements: {
        list: { type: 'List', props: { items: [{ label: 'kept' }] }, repeat: { statePath: '/orders' } },
      },
    };
    expect(inlineRepeatLeaves(spec)).toBe(spec);
  });

  it('leaves a Table repeat untouched (recovery is scoped to List)', () => {
    const spec: Spec = {
      root: 't',
      state: { rows: [['a']] },
      elements: {
        t: { type: 'Table', props: { columns: ['c'], rows: [] }, repeat: { statePath: '/rows' } },
      },
    };
    expect(inlineRepeatLeaves(spec)).toBe(spec);
  });

  it('is a no-op when the repeat state array is empty or missing', () => {
    const spec: Spec = {
      root: 'list',
      state: {},
      elements: {
        list: { type: 'List', props: { items: [] }, repeat: { statePath: '/missing' } },
      },
    };
    expect(inlineRepeatLeaves(spec)).toBe(spec);
  });

  it('is a no-op on a spec with no elements', () => {
    const spec = { root: '', elements: {} } as Spec;
    expect(inlineRepeatLeaves(spec)).toBe(spec);
  });
});
