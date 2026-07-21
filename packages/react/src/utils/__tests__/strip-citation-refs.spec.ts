import { describe, expect, it } from 'vitest';
import { stripCitationRefs } from '../strip-citation-refs';

describe('stripCitationRefs', () => {
  it('strips the model-facing tag form', () => {
    expect(stripCitationRefs('Refunds take 5 days.<ref id="knowledge:2"/> Anything else?')).toBe(
      'Refunds take 5 days. Anything else?',
    );
  });

  it('strips the resolved typed form (persisted-with-references defensive path)', () => {
    expect(
      stripCitationRefs('See policy.<ref type="knowledge" id="kb-9" /> Done.'),
    ).toBe('See policy. Done.');
  });

  it('strips multiple tags in one text', () => {
    expect(
      stripCitationRefs('A<ref id="knowledge:0"/> and B<ref id="instruction:1"/>.'),
    ).toBe('A and B.');
  });

  it('strips a partial tag cut mid-stream at the end of the buffer', () => {
    expect(stripCitationRefs('The answer is 5 days.<ref id="know')).toBe('The answer is 5 days.');
    expect(stripCitationRefs('The answer is 5 days.<re')).toBe('The answer is 5 days.');
  });

  it('leaves a bare trailing "<" alone (may be legitimate text)', () => {
    expect(stripCitationRefs('x <')).toBe('x <');
  });

  it('leaves plain text, markdown links, and comparisons untouched', () => {
    const text = '5 < 10, see [guide](https://docs.x/a) & `<code>` refs.';
    expect(stripCitationRefs(text)).toBe(text);
  });

  it('handles empty input', () => {
    expect(stripCitationRefs('')).toBe('');
  });

  it('strips a complete <citations> report block', () => {
    expect(
      stripCitationRefs(
        'The answer.\n\n<citations>\n<cite id="knowledge:2" used="yes" part="p" why="w"/>\n</citations>',
      ),
    ).toBe('The answer.');
  });

  it('strips an unterminated <citations> block still streaming in', () => {
    expect(
      stripCitationRefs('The answer.\n\n<citations>\n<cite id="knowledge:2" used="y'),
    ).toBe('The answer.');
  });

  it('strips a partially-streamed <citations opener and a partial <cite tag', () => {
    expect(stripCitationRefs('The answer.\n<citatio')).toBe('The answer.');
    expect(stripCitationRefs('The answer.\n<cite id="know')).toBe('The answer.');
  });

  it('strips a stray complete <cite/> line outside a block', () => {
    expect(stripCitationRefs('A.<cite id="knowledge:0" used="yes"/> B.')).toBe('A. B.');
  });
});
