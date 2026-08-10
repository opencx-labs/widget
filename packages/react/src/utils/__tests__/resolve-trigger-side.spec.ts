import { describe, expect, it } from 'vitest';
import { resolveTriggerSide } from '../resolve-trigger-side';

describe(resolveTriggerSide.name, () => {
  it('defaults to right on LTR when no offset config', () => {
    expect(resolveTriggerSide(undefined, 'ltr')).toBe('right');
    expect(resolveTriggerSide({}, 'ltr')).toBe('right');
  });

  it('defaults to left on RTL when no offset config', () => {
    expect(resolveTriggerSide(undefined, 'rtl')).toBe('left');
    expect(resolveTriggerSide({}, 'rtl')).toBe('left');
  });

  it('explicit numeric right wins over RTL direction', () => {
    expect(resolveTriggerSide({ right: 20 }, 'rtl')).toBe('right');
    expect(resolveTriggerSide({ right: 20, left: 'initial' }, 'rtl')).toBe(
      'right',
    );
    expect(resolveTriggerSide({ right: 0 }, 'rtl')).toBe('right');
  });

  it('explicit numeric left wins over LTR direction', () => {
    expect(resolveTriggerSide({ left: 20 }, 'ltr')).toBe('left');
    expect(resolveTriggerSide({ left: 20, right: 'initial' }, 'ltr')).toBe(
      'left',
    );
    expect(resolveTriggerSide({ left: 0 }, 'ltr')).toBe('left');
  });

  it('explicit numeric offset on the direction-default side keeps that side', () => {
    expect(resolveTriggerSide({ right: 32 }, 'ltr')).toBe('right');
    expect(resolveTriggerSide({ left: 32 }, 'rtl')).toBe('left');
  });

  it('falls back to direction default when both sides are numeric (ambiguous)', () => {
    expect(resolveTriggerSide({ right: 20, left: 20 }, 'ltr')).toBe('right');
    expect(resolveTriggerSide({ right: 20, left: 20 }, 'rtl')).toBe('left');
  });

  it("treats 'initial' as not-a-side, falling back to direction default", () => {
    expect(resolveTriggerSide({ right: 'initial' }, 'ltr')).toBe('right');
    expect(resolveTriggerSide({ right: 'initial' }, 'rtl')).toBe('left');
    expect(resolveTriggerSide({ left: 'initial' }, 'rtl')).toBe('left');
    expect(
      resolveTriggerSide({ right: 'initial', left: 'initial' }, 'rtl'),
    ).toBe('left');
  });

  it('only bottom offset configured falls back to direction default', () => {
    expect(resolveTriggerSide({ bottom: 40 }, 'ltr')).toBe('right');
    expect(resolveTriggerSide({ bottom: 40 }, 'rtl')).toBe('left');
  });

  it('unknown direction values behave as LTR', () => {
    expect(resolveTriggerSide(undefined, '')).toBe('right');
    expect(resolveTriggerSide(undefined, 'auto')).toBe('right');
  });
});
