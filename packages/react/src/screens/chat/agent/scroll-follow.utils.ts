/** Distance from the bottom (px) within which the stream keeps auto-following
 * and the scroll-to-bottom button stays hidden. */
export const SCROLL_NEAR_BOTTOM_PX = 150;

/** The subset of a scroll container's geometry the follow decision reads. */
export type ScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

/**
 * True when the viewport is within `threshold` px of the bottom — i.e. the
 * user is effectively pinned, so the stream should keep following and the
 * scroll-to-bottom button stays hidden. A container that can't scroll
 * (content fits: `scrollHeight <= clientHeight`) is always "near bottom".
 */
export function isNearBottom(
  { scrollHeight, scrollTop, clientHeight }: ScrollMetrics,
  threshold: number = SCROLL_NEAR_BOTTOM_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight < threshold;
}
