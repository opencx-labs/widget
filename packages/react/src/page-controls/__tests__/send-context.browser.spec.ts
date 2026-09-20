// What one message actually carries about the page. The reader runs on the
// send path, so this is also the check that a page turn costs no round trip
// and no second look at the DOM.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PageMark } from '../../page-marks/page-mark';
import { resetRefsForTest } from '../control-ref';
import { buildPageClientContext } from '../send-context';

const mark: PageMark = {
  shape: 'box',
  note: 'why is this off?',
  pageUrl: 'https://payla.test/settings',
  rect: { x: 0, y: 0, width: 10, height: 10 },
  elements: [{ name: 'div "Live"', selector: '#mode', tag: 'div' }],
};

beforeEach(() => {
  resetRefsForTest();
  document.body.innerHTML = `<button>Change plan</button><a href="/x">Invoices</a>`;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the page context one message carries', () => {
  it('sends the controls it read, with the marks when there are any', () => {
    const context = buildPageClientContext({ marks: [mark], readsPage: true });

    expect(context?.['page_marks']).toEqual([mark]);
    expect(context?.['picked_elements']).toHaveLength(1);
    expect(context?.['page_controls']).toEqual([
      { ref: expect.any(String), role: 'button', name: 'Change plan' },
      { ref: expect.any(String), role: 'link', name: 'Invoices' },
    ]);
    expect(context?.['page_controls_truncated']).toBeUndefined();
  });

  it('sends the controls even when the visitor marked nothing', () => {
    const context = buildPageClientContext({ marks: [], readsPage: true });

    expect(context?.['page_marks']).toBeUndefined();
    expect(context?.['page_controls']).toHaveLength(2);
  });

  it('sends nothing at all when the embed does not share the page', () => {
    // Positive control: the same page and marks DO produce context when on.
    expect(
      buildPageClientContext({ marks: [mark], readsPage: true }),
    ).toBeDefined();
    expect(
      buildPageClientContext({ marks: [mark], readsPage: false }),
    ).toBeUndefined();
  });

  it('sends nothing when the page has no controls worth naming', () => {
    document.body.innerHTML = '<p>Just some prose.</p>';

    expect(
      buildPageClientContext({ marks: [], readsPage: true }),
    ).toBeUndefined();
  });
});
