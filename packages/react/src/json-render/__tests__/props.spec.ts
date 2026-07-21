import { describe, expect, it } from 'vitest';
import {
  cardPropsSchema,
  chartPropsSchema,
  metricPropsSchema,
  parseProps,
  tablePropsSchema,
} from '../props';

/**
 * Defense layer: `parseProps` returns a typed fallback instead of throwing when
 * a streamed prop is malformed or half-formed. One bad prop must never crash the
 * whole spec render.
 */
describe('parseProps', () => {
  it('returns the parsed value for valid props', () => {
    const out = parseProps(metricPropsSchema, { label: 'Spent', value: '$5' }, { label: '', value: '' });
    expect(out).toEqual({ label: 'Spent', value: '$5' });
  });

  it('returns the fallback when a required prop is missing', () => {
    const fallback = { label: '', value: '' };
    // `value` missing → invalid → fallback (not a throw).
    expect(parseProps(metricPropsSchema, { label: 'x' }, fallback)).toBe(fallback);
  });

  it('returns the fallback when a prop has the wrong type', () => {
    const fallback = { columns: [], rows: [] };
    expect(parseProps(tablePropsSchema, { columns: 'nope', rows: [] }, fallback)).toBe(fallback);
  });

  it('accepts an object with omitted optional (nullish) props', () => {
    // All Card props are optional → `{}` is valid, fallback not used.
    const out = parseProps(cardPropsSchema, {}, { title: 'fallback' });
    expect(out).toEqual({});
  });

  it('rejects an invalid enum value and falls back', () => {
    const fallback = { type: 'bar' as const, data: [] };
    expect(parseProps(chartPropsSchema, { type: 'pie3d', data: [] }, fallback)).toBe(fallback);
  });

  it('accepts a valid chart payload', () => {
    const out = parseProps(
      chartPropsSchema,
      { type: 'line', data: [{ label: 'Jan', value: 1 }] },
      { type: 'bar', data: [] },
    );
    expect(out).toEqual({ type: 'line', data: [{ label: 'Jan', value: 1 }] });
  });
});
