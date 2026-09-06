// `picked_elements` is the widget↔backend contract that OUTLIVES the turn:
// the backend re-surfaces it on later turns ("highlight it again") and
// customer-facing surfaces read the names back from it. `page_marks` alone
// reaches only the current turn's client-context block.
import { describe, expect, it } from 'vitest';
import { pickedElementsFromMarks, type PageMark } from '../page-mark';

function mark(overrides: Partial<PageMark> = {}): PageMark {
  return {
    shape: 'box',
    pageUrl: 'http://host.test/settings',
    rect: { x: 0, y: 0, width: 10, height: 10 },
    elements: [
      { name: 'button "Save"', selector: '#save', tag: 'button' },
      { name: 'div "Card"', selector: '#card', tag: 'div' },
    ],
    ...overrides,
  };
}

describe('pickedElementsFromMarks', () => {
  it('flattens the marks and puts the note on the element it was placed on', () => {
    expect(
      pickedElementsFromMarks([mark({ note: 'why is this off?' })]),
    ).toEqual([
      {
        name: 'button "Save"',
        selector: '#save',
        tag: 'button',
        note: 'why is this off?',
      },
      { name: 'div "Card"', selector: '#card', tag: 'div' },
    ]);
  });

  it('dedupes across marks and survives elements without a selector', () => {
    const second = mark({
      note: 'and this',
      elements: [
        { name: 'button "Save"', selector: '#save', tag: 'button' },
        { name: 'icon', selector: '', tag: 'svg' },
      ],
    });
    const picked = pickedElementsFromMarks([mark(), second]);

    expect(picked.map((el) => el.name)).toEqual([
      'button "Save"',
      'div "Card"',
      'icon',
    ]);
    // The second mark's focus element was the duplicate: dropping the
    // duplicate must not drop the question that was written on it.
    expect(picked.find((el) => el.name === 'button "Save"')?.note).toBe(
      'and this',
    );
  });

  it('is empty for no marks', () => {
    expect(pickedElementsFromMarks([])).toEqual([]);
  });
});
