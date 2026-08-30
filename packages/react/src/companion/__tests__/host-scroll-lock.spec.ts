import { afterEach, describe, expect, it } from 'vitest';
import { lockHostScroll } from '../host-scroll-lock';

describe('lockHostScroll', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('restores the host style only after the final owner releases', () => {
    document.body.style.overflow = 'auto';
    const releaseFirst = lockHostScroll();
    const releaseSecond = lockHostScroll();

    releaseFirst();
    expect(document.body.style.overflow).toBe('hidden');

    releaseSecond();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('makes releases idempotent', () => {
    const release = lockHostScroll();
    release();
    release();
    expect(document.body.style.overflow).toBe('');
  });
});
