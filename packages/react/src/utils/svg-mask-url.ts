/**
 * The SVG markup is untrusted (org-authored, delivered by the backend). It is
 * therefore never mounted into the DOM — it is only ever rendered through CSS
 * `mask-image`, an image context where scripts cannot execute and external
 * resources cannot load. Validation here is about renderability, not safety.
 */
const MAX_SVG_ICON_LENGTH = 10 * 1024;

const cache = new Map<string, string | null>();

/**
 * Turns a raw `<svg>` string into a `data:` URL for CSS `mask-image`.
 * Returns null when the string is not a parseable standalone SVG document.
 */
export function svgToMaskUrl(svg: string): string | null {
  const cached = cache.get(svg);
  if (cached !== undefined) return cached;

  const url = toMaskUrl(svg);
  cache.set(svg, url);
  return url;
}

function toMaskUrl(svg: string): string | null {
  const trimmed = svg.trim();
  if (!trimmed || trimmed.length > MAX_SVG_ICON_LENGTH) return null;
  if (typeof DOMParser === 'undefined') return null;

  const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  const root = doc.documentElement;
  if (
    root.localName !== 'svg' ||
    root.namespaceURI !== 'http://www.w3.org/2000/svg' ||
    doc.getElementsByTagName('parsererror').length > 0
  ) {
    return null;
  }

  return `data:image/svg+xml,${encodeURIComponent(trimmed)}`;
}
