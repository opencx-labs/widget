import { describe, expect, it } from 'vitest';
import { identifyElementName } from '../page-element';

function el(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  const node = host.firstElementChild;
  if (!(node instanceof HTMLElement)) throw new Error('no element');
  return node;
}

/**
 * REGRESSION: a marked region showed up in the composer named `p-0!` — a
 * Tailwind utility, read off the element's class list. Utilities describe how
 * a thing is drawn, never what it is.
 */
describe('identifyElementName', () => {
  it('never names a region after a utility class', () => {
    expect(identifyElementName(el('<div class="p-0!"></div>'))).toBe(
      'container',
    );
    expect(identifyElementName(el('<div class="gap-1.5 flex"></div>'))).toBe(
      'container',
    );
    expect(identifyElementName(el('<div class="w-[32px]"></div>'))).toBe(
      'container',
    );
    expect(
      identifyElementName(el('<div class="hover:bg-red-500"></div>')),
    ).toBe('container');
    expect(
      identifyElementName(el('<section class="bg-black/50"></section>')),
    ).toBe('section');
  });

  it('still uses an authored class when there is one', () => {
    // Long `-suffix` segments are stripped as build hashes (existing rule), so
    // this asserts the utility filter alone: the authored name survives.
    expect(identifyElementName(el('<div class="p-0! cart-box"></div>'))).toBe(
      'cart-box',
    );
  });

  it('prefers what the element says over any class', () => {
    expect(
      identifyElementName(el('<button class="p-0!">Save changes</button>')),
    ).toBe('button "Save changes"');
  });
});
