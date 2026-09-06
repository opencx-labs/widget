import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPANION_LAYOUTS,
  normalizeCompanionLayouts,
  resolveCompanionDefaultLayout,
  resolveSidebarMode,
  resolveSidebarSide,
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

describe('resolveSidebarSide', () => {
  it('honors an explicit side in both directions', () => {
    expect(resolveSidebarSide('left', 'ltr')).toBe('left');
    expect(resolveSidebarSide('right', 'rtl')).toBe('right');
  });

  it('follows the host dir for `auto` (the inline-end edge)', () => {
    expect(resolveSidebarSide('auto', 'ltr')).toBe('right');
    expect(resolveSidebarSide('auto', 'rtl')).toBe('left');
  });

  it.each([undefined, null, 'top', 42])(
    'falls back to the inline-end edge for %p',
    (side) => {
      expect(resolveSidebarSide(side, 'ltr')).toBe('right');
      expect(resolveSidebarSide(side, 'rtl')).toBe('left');
    },
  );
});

describe('resolveSidebarMode', () => {
  it('docks only on an explicit docked mode; anything else floats', () => {
    expect(resolveSidebarMode('docked')).toBe('docked');
    expect(resolveSidebarMode('floating')).toBe('floating');
    expect(resolveSidebarMode(undefined)).toBe('floating');
    expect(resolveSidebarMode('nonsense')).toBe('floating');
  });
});
