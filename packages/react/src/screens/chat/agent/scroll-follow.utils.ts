/** Distance from the bottom (px) within which the stream keeps auto-following
 * and the scroll-to-bottom button stays hidden. Mirrors the companion chat
 * (dashboard companion/_components/Chat.tsx `SCROLL_NEAR_BOTTOM_PX`). */
export const SCROLL_NEAR_BOTTOM_PX = 150;

/** The subset of a scroll container's geometry the follow decision reads. */
export type ScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export class ScrollFollowUtils {
  /**
   * True when the viewport is within `threshold` px of the bottom — i.e. the
   * user is effectively pinned, so the stream should keep following and the
   * scroll-to-bottom button stays hidden. A container that can't scroll
   * (content fits: `scrollHeight <= clientHeight`) is always "near bottom".
   */
  static isNearBottom(
    { scrollHeight, scrollTop, clientHeight }: ScrollMetrics,
    threshold: number = SCROLL_NEAR_BOTTOM_PX,
  ): boolean {
    return scrollHeight - scrollTop - clientHeight < threshold;
  }
}
