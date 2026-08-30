import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPANION_LAYOUTS,
  normalizeCompanionLayouts,
  resolveCompanionDefaultLayout,
} from '../../utils/companion-layout';

describe('normalizeCompanionLayouts', () => {
  it('preserves configured order and removes duplicates', () => {
    expect(
      normalizeCompanionLayouts([
        'fullscreen',
        'compact',
        'fullscreen',
        'sidebar',
      ]),
    ).toEqual(['fullscreen', 'compact', 'sidebar']);
  });

  it('ignores invalid runtime values', () => {
    expect(normalizeCompanionLayouts(['sidebar', 'invalid', null])).toEqual([
      'sidebar',
    ]);
  });

  it.each([undefined, [], ['invalid'], {}])(
    'falls back to every layout for an unusable list (%j)',
    (layouts) => {
      expect(normalizeCompanionLayouts(layouts)).toEqual(
        DEFAULT_COMPANION_LAYOUTS,
      );
    },
  );
});

describe('resolveCompanionDefaultLayout', () => {
  it('uses the configured default when it is allowed', () => {
    expect(
      resolveCompanionDefaultLayout('compact', ['sidebar', 'compact']),
    ).toBe('compact');
  });

  it('falls back to the first configured layout when the default is excluded', () => {
    expect(
      resolveCompanionDefaultLayout('compact', ['fullscreen', 'sidebar']),
    ).toBe('fullscreen');
  });
});
