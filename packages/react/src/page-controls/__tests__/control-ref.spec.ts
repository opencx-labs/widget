import { afterEach, expect, it } from 'vitest';
import { beginSnapshot, resolveRef } from '../control-ref';

afterEach(() => {
  document.body.innerHTML = '';
});

it('never reassigns an expired reference to a different control on a long-lived page', () => {
  document.body.innerHTML =
    '<button id="first">First</button><button id="second">Second</button>';
  const first = document.querySelector<HTMLElement>('#first');
  const second = document.querySelector<HTMLElement>('#second');
  if (!first || !second) throw new Error('fixture missing');
  const stale = beginSnapshot()(first);
  let current = stale;
  for (let n = 0; n < 1000; n++) current = beginSnapshot()(second);
  expect(resolveRef(current)).toBe(second);
  expect(resolveRef(stale)).toBeNull();
});

it('keeps a continuously offered control stable but never resurrects expired handles', () => {
  const element = document.createElement('button');
  document.body.append(element);
  const original = beginSnapshot()(element);
  for (let n = 0; n < 8; n++) expect(beginSnapshot()(element)).toBe(original);
  expect(resolveRef(original)).toBe(element);
  beginSnapshot();
  beginSnapshot();
  expect(resolveRef(original)).toBeNull();
  const renewed = beginSnapshot()(element);
  expect(renewed).not.toBe(original);
  expect(resolveRef(renewed)).toBe(element);
  expect(resolveRef(original)).toBeNull();
  const replacement = document.createElement('button');
  element.replaceWith(replacement);
  const replacementRef = beginSnapshot()(replacement);
  expect(replacementRef).not.toBe(renewed);
  expect(resolveRef(renewed)).toBeNull();
  expect(resolveRef(replacementRef)).toBe(replacement);
});
