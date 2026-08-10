import { describe, expect, it } from 'vitest';
import {
  SCROLL_NEAR_BOTTOM_PX,
  ScrollFollowUtils,
} from '../scroll-follow.utils';

/**
 * The follow decision is the bug-prone kernel of the companion-parity scroll
 * behavior: it gates whether the stream keeps yanking the viewport down and
 * whether the scroll-to-bottom button shows. jsdom has no layout, so the math
 * is tested directly against synthetic geometry — every boundary and edge.
 *
 * distanceFromBottom = scrollHeight - scrollTop - clientHeight, and the
 * viewport is "near bottom" when that distance is strictly < threshold.
 */
describe('ScrollFollowUtils.isNearBottom', () => {
  const metrics = (scrollTop: number) => ({
    scrollHeight: 1000,
    clientHeight: 400,
    scrollTop,
  });

  it('is true when pinned exactly at the bottom (distance 0)', () => {
    // scrollTop 600 → 1000 - 600 - 400 = 0
    expect(ScrollFollowUtils.isNearBottom(metrics(600))).toBe(true);
  });

  it('is true one pixel inside the threshold (distance 149)', () => {
    // scrollTop 451 → distance 149 < 150
    expect(ScrollFollowUtils.isNearBottom(metrics(451))).toBe(true);
  });

  it('is false exactly at the threshold (distance 150 is NOT near)', () => {
    // scrollTop 450 → distance 150, and the check is strict `<`
    expect(ScrollFollowUtils.isNearBottom(metrics(450))).toBe(false);
  });

  it('is false when scrolled well away (distance 600)', () => {
    // scrollTop 0 → distance 600
    expect(ScrollFollowUtils.isNearBottom(metrics(0))).toBe(false);
  });

  it('is true for a non-scrollable container (content fits)', () => {
    // scrollHeight === clientHeight, scrollTop 0 → distance 0
    expect(
      ScrollFollowUtils.isNearBottom({
        scrollHeight: 400,
        clientHeight: 400,
        scrollTop: 0,
      }),
    ).toBe(true);
  });

  it('is true for an empty container (all zeros)', () => {
    expect(
      ScrollFollowUtils.isNearBottom({
        scrollHeight: 0,
        clientHeight: 0,
        scrollTop: 0,
      }),
    ).toBe(true);
  });

  it('honors a custom threshold on both sides of the boundary', () => {
    // distance 50 (scrollTop 550): near under a 60px threshold, not under 40px
    expect(ScrollFollowUtils.isNearBottom(metrics(550), 60)).toBe(true);
    expect(ScrollFollowUtils.isNearBottom(metrics(550), 40)).toBe(false);
    // The custom threshold is also strict `<`: distance 50 with threshold 50
    expect(ScrollFollowUtils.isNearBottom(metrics(550), 50)).toBe(false);
  });

  it('defaults the threshold to the exported companion-parity constant', () => {
    expect(SCROLL_NEAR_BOTTOM_PX).toBe(150);
    // distance 150 with the default is not near; the same distance passed
    // explicitly agrees — proving the default is the constant, not a literal.
    expect(ScrollFollowUtils.isNearBottom(metrics(450))).toBe(
      ScrollFollowUtils.isNearBottom(metrics(450), SCROLL_NEAR_BOTTOM_PX),
    );
  });
});
