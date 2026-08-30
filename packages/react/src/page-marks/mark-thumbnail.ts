import { toJpeg } from 'html-to-image';
import { isWidgetOwned } from './page-element';

/**
 * Pill thumbnails for marked regions: the region's focus element is
 * rasterized (html-to-image, foreignObject + canvas) so the composer pill can
 * show the actual pixels the visitor marked instead of a tag name. The
 * snapshot is a UI affordance only — it rides a WeakMap beside the annotation,
 * exactly like the ink registry, and is NEVER serialized into the send
 * payload (a base64 screenshot in `clientContext` would bloat every send).
 *
 * The widget's own overlays (marks, editor chrome) are SIBLINGS or portals,
 * never descendants of host elements — and widget-owned nodes are filtered
 * out of the clone as a second guard — so a snapshot never photographs the
 * widget itself.
 */

/** Longest thumbnail edge, in CSS px — pills render at ~2.5rem tall. */
const MAX_EDGE_PX = 480;
/** A snapshot that can't land quickly shouldn't hold the pill hostage. */
const CAPTURE_TIMEOUT_MS = 3000;

const thumbnails = new WeakMap<object, Promise<string | null>>();

/**
 * Rasterize an element to a JPEG data URL, or null when it can't be done
 * (cross-origin resources, zero-size rects, timeouts). Never throws — the
 * pill falls back to its text form on null.
 */
async function captureThumbnail(el: HTMLElement): Promise<string | null> {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;

  // Scale so the longest edge lands at thumbnail size: big regions shrink,
  // small controls keep (at most) retina density.
  const pixelRatio = Math.min(
    2,
    Math.max(0.5, MAX_EDGE_PX / Math.max(rect.width, rect.height)),
  );

  const capture = toJpeg(el, {
    quality: 0.85,
    pixelRatio,
    backgroundColor: '#ffffff',
    // Never let the widget photograph itself (ink SVGs, portaled chrome, the
    // embed root inside a picked ancestor).
    filter: (node) =>
      !(node instanceof Element) ||
      !(isWidgetOwned(node) || node.hasAttribute('data-opencx-root')),
  });
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS),
  );
  try {
    return await Promise.race([capture, timeout]);
  } catch {
    return null;
  }
}

/** Kick off (and register) a snapshot keyed by its annotation object. */
export function beginThumbnail(key: object, el: HTMLElement) {
  thumbnails.set(key, captureThumbnail(el));
}

/** The key's in-flight/settled snapshot, if one was started. */
export function getThumbnail(key: object): Promise<string | null> | undefined {
  return thumbnails.get(key);
}
