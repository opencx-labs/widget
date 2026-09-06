import { toJpeg } from 'html-to-image';
import { isWidgetOwned } from './page-element';

/**
 * Pill thumbnails for marked regions: the region's focus element is
 * rasterized (html-to-image, foreignObject + canvas) so the composer pill can
 * show the actual pixels the visitor marked instead of a tag name. The base64
 * rides a WeakMap beside the annotation, exactly like the ink registry, and is
 * NEVER serialized into the send payload (a screenshot in `clientContext`
 * would bloat every send). What outlives the composer is the UPLOAD: the
 * thumbnail goes up as a message file the moment it lands, and its URL is
 * written onto the mark (`snapshotUrl`) so the sent bubble after a reload and
 * the inbox show the same picture the composer did.
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
    filter: (node) => !(node instanceof Element) || !isWidgetOwned(node),
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

const snapshotUploads = new WeakMap<object, Promise<string | null>>();

/**
 * Upload the mark's thumbnail once it settles and write the resulting URL
 * onto the mark. Registered like the thumbnail so a send can wait for an
 * upload still in flight (`awaitSnapshotUrl`). A failed capture or upload
 * resolves null and leaves the mark without a snapshot — never throws.
 */
export function beginSnapshotUpload(
  mark: { snapshotUrl?: string },
  upload: (file: File) => Promise<string | null>,
) {
  const thumbnail = thumbnails.get(mark);
  if (!thumbnail) return;
  const uploaded = thumbnail
    .then((dataUrl) => {
      const file = dataUrl ? fileFromDataUrl(dataUrl, 'page-mark.jpg') : null;
      return file ? upload(file) : null;
    })
    .catch(() => null)
    .then((url) => {
      if (url) mark.snapshotUrl = url;
      return url;
    });
  snapshotUploads.set(mark, uploaded);
}

/**
 * The mark's snapshot URL, waiting at most `maxWaitMs` for an in-flight
 * upload. A send must not hang on a slow upload: past the cap the mark goes
 * out without its picture (text fallback), and the URL, if it lands later,
 * is simply never persisted.
 */
export async function awaitSnapshotUrl(
  mark: { snapshotUrl?: string },
  maxWaitMs: number,
): Promise<string | null> {
  if (mark.snapshotUrl) return mark.snapshotUrl;
  const pending = snapshotUploads.get(mark);
  if (!pending) return null;
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), maxWaitMs),
  );
  return Promise.race([pending, timeout]);
}

/** A `data:` URL (as `toJpeg` returns) as an uploadable File. */
export function fileFromDataUrl(dataUrl: string, name: string): File | null {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const [, type, base64] = match;
  if (!type || base64 === undefined) return null;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type });
  } catch {
    return null;
  }
}

/** The key's in-flight/settled snapshot, if one was started. */
export function getThumbnail(key: object): Promise<string | null> | undefined {
  return thumbnails.get(key);
}
