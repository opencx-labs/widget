import { describe, expect, it } from 'vitest';
import { pageClickDismisses } from '../companion-dismissal';

const open = {
  state: 'chat',
  layout: 'compact',
  sidebarMode: 'floating',
  isPageMarkModeArmed: false,
} as const;

describe('Host-page click dismissal', () => {
  it('closes the floating layouts, which overlay the page', () => {
    expect(pageClickDismisses(open)).toBe(true);
    expect(pageClickDismisses({ ...open, layout: 'fullscreen' })).toBe(true);
    expect(pageClickDismisses({ ...open, state: 'input' })).toBe(true);
  });

  it('closes a floating sidebar, same as the compact panel', () => {
    expect(pageClickDismisses({ ...open, layout: 'sidebar' })).toBe(true);
  });

  it('leaves a docked sidebar open: the page lives beside it, not under it', () => {
    expect(
      pageClickDismisses({
        ...open,
        layout: 'sidebar',
        sidebarMode: 'docked',
      }),
    ).toBe(false);
  });

  it('ignores clicks while the panel is resting as a pill', () => {
    expect(pageClickDismisses({ ...open, state: 'pill' })).toBe(false);
  });

  it('keeps the panel open while mark mode is armed, in every layout', () => {
    for (const layout of ['compact', 'sidebar', 'fullscreen'] as const) {
      expect(
        pageClickDismisses({ ...open, layout, isPageMarkModeArmed: true }),
      ).toBe(false);
    }
  });
});
