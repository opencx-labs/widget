import { describe, expect, it } from 'vitest';
import { svgToMaskUrl } from '../svg-mask-url';

const VALID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';

describe(svgToMaskUrl.name, () => {
  it('encodes a valid svg as a data url', () => {
    const url = svgToMaskUrl(VALID_SVG);
    expect(url).toBe(`data:image/svg+xml,${encodeURIComponent(VALID_SVG)}`);
  });

  it('tolerates surrounding whitespace', () => {
    expect(svgToMaskUrl(`\n  ${VALID_SVG}  \n`)).toBe(
      `data:image/svg+xml,${encodeURIComponent(VALID_SVG)}`,
    );
  });

  it('rejects an empty string', () => {
    expect(svgToMaskUrl('')).toBeNull();
    expect(svgToMaskUrl('   ')).toBeNull();
  });

  it('rejects non-svg content', () => {
    expect(svgToMaskUrl('waiting on vendor')).toBeNull();
    expect(svgToMaskUrl('<div>not an icon</div>')).toBeNull();
    expect(
      svgToMaskUrl('<svg xmlns="http://example.com/not-svg"></svg>'),
    ).toBeNull();
  });

  it('rejects malformed svg markup', () => {
    expect(
      svgToMaskUrl('<svg xmlns="http://www.w3.org/2000/svg"><path'),
    ).toBeNull();
  });

  it('rejects oversized payloads', () => {
    const bloated = VALID_SVG.replace(
      '<circle',
      `<!-- ${'x'.repeat(11 * 1024)} --><circle`,
    );
    expect(svgToMaskUrl(bloated)).toBeNull();
  });

  it('produces a url safe to wrap in a quoted css url()', () => {
    const withQuotes =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z"/></svg>';
    const url = svgToMaskUrl(withQuotes);
    expect(url).not.toBeNull();
    expect(url).not.toContain('"');
  });
});
