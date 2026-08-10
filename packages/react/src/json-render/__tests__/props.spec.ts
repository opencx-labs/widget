import { describe, expect, it } from 'vitest';
import {
  cardPropsSchema,
  chartPropsSchema,
  metricPropsSchema,
  parseProps,
  listItemSchema,
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

/**
 * `href` on a list item is MODEL-authored, so it is untrusted: a poisoned
 * knowledge-base article or a crafted customer message can put any string there,
 * and the anchor renders in the embedder's realm. Only plain web/mail links may
 * survive the parse. `javascript:` is the one that matters most — React 19
 * refuses it, but this package's peer range still admits React 18, where it
 * would be script execution in the host origin.
 */
describe('listItemSchema href (model-authored, untrusted)', () => {
  const parse = (href: unknown) =>
    listItemSchema.parse({ label: 'Open invoice', href }).href;

  it('keeps http, https and mailto links', () => {
    expect(parse('https://example.com/invoice/1')).toBe('https://example.com/invoice/1');
    expect(parse('http://example.com')).toBe('http://example.com');
    expect(parse('mailto:support@example.com')).toBe('mailto:support@example.com');
  });

  it('drops javascript: URLs instead of rendering them', () => {
    expect(parse('javascript:alert(document.cookie)')).toBeNull();
    // Case and leading whitespace must not smuggle it past the check.
    expect(parse('JaVaScRiPt:alert(1)')).toBeNull();
    expect(parse('  javascript:alert(1)')).toBeNull();
  });

  it('drops every other non-web scheme', () => {
    expect(parse('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(parse('blob:https://example.com/uuid')).toBeNull();
    expect(parse('file:///etc/passwd')).toBeNull();
    expect(parse('vbscript:msgbox(1)')).toBeNull();
  });

  it('drops relative URLs — they would resolve against whatever page hosts the widget', () => {
    expect(parse('/account/settings')).toBeNull();
    expect(parse('../admin')).toBeNull();
  });

  it('treats absent, null and empty href as no link', () => {
    expect(parse(undefined)).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse('')).toBeNull();
  });

  it('never throws on a bad href — the item still parses, just without a link', () => {
    expect(() => listItemSchema.parse({ label: 'x', href: 'javascript:alert(1)' })).not.toThrow();
    expect(listItemSchema.parse({ label: 'x', href: 'not a url at all' })).toEqual({
      label: 'x',
      href: null,
    });
  });
});
