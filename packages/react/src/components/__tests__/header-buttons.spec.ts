import { describe, expect, it } from 'vitest';
import type { HeaderButtonU } from '@opencx/widget-core';
import { resolveHeaderButtons } from '../Header';

/**
 * Close lives in exactly one place per shell: the popover header (on small
 * screens) or the companion's corner controls. The companion header must not
 * add a second one.
 */
describe('resolveHeaderButtons', () => {
  it('popover falls back to the small-screen Close', () => {
    const buttons = resolveHeaderButtons({
      configured: undefined,
      isCompanion: false,
    });
    expect(buttons).toEqual([
      { functionality: 'close-widget', hideOnLargeScreen: true, icon: 'X' },
    ]);
  });

  it('companion adds no default button — its corner controls own Close', () => {
    expect(
      resolveHeaderButtons({ configured: undefined, isCompanion: true }),
    ).toEqual([]);
    expect(resolveHeaderButtons({ configured: [], isCompanion: true })).toEqual(
      [],
    );
  });

  it('configured buttons win in both shells', () => {
    const configured: HeaderButtonU[] = [
      { functionality: 'expand-shrink', icon: 'Maximize2' },
    ];
    expect(resolveHeaderButtons({ configured, isCompanion: true })).toBe(
      configured,
    );
    expect(resolveHeaderButtons({ configured, isCompanion: false })).toBe(
      configured,
    );
  });
});
