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
