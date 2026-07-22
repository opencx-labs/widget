/**
 * Element identification for the composer's element picker (agentation-style
 * "click an element on the host page and attach it as context").
 *
 * The widget's React code runs in the HOST page realm (only the chat UI is
 * portaled into a same-origin iframe), so `document` here is the host page
 * document — these helpers read the customer's page directly.
 */

export type PickedElementRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The context captured for one picked element. Serialized as
 * `clientContext.picked_elements` on the send payload, so every field must be
 * JSON-safe and meaningful to the LLM (names over node references).
 */
export type PickedElement = {
  /** Human-readable name, e.g. `button "Create Key"`. */
  name: string;
  /** Readable ancestry path, e.g. `#api-keys > .toolbar > button`. */
  path: string;
  /** Resolvable CSS selector (verified against the document at capture time). */
  selector: string;
  /** Lowercased tag name. */
  tag: string;
  /** The element's own visible text, truncated. */
  text?: string;
  /** Page URL at capture time. */
  pageUrl: string;
  /** Viewport-relative bounding box at capture time. */
  rect: PickedElementRect;
};

const TEXT_TRUNCATE = 60;

/** `CSS.escape` with a fallback for environments that lack the `CSS` global. */
function cssEscape(ident: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(ident);
  }
  return ident.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function cleanText(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** First class name that looks authored (not a hash, not a 1-2 char utility). */
function meaningfulClass(el: HTMLElement): string | null {
  const className = el.getAttribute('class');
  if (!className) return null;
  const cls = className
    .split(/\s+/)
    .map((c) => c.replace(/[_-][a-zA-Z0-9]{5,}.*$/, ''))
    .find((c) => c.length > 2 && !/^[a-z]{1,2}$/.test(c) && !/[A-Z0-9]{5,}/.test(c));
  return cls ?? null;
}

/**
 * Human-readable name for an element — what the context pill shows and what
 * the LLM reads. Buttons are named by their text, inputs by placeholder/name,
 * images by alt (the naming heuristics agentation proved out).
 */
export function identifyElementName(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const aria = el.getAttribute('aria-label');
  const text = cleanText(el);

  if (tag === 'button' || el.getAttribute('role') === 'button') {
    if (aria) return `button [${aria}]`;
    return text ? `button "${truncate(text, 30)}"` : 'button';
  }
  if (tag === 'a') {
    if (text) return `link "${truncate(text, 30)}"`;
    const href = el.getAttribute('href');
    return href ? `link to ${truncate(href, 40)}` : 'link';
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const placeholder = el.getAttribute('placeholder');
    const name = el.getAttribute('name');
    if (placeholder) return `${tag} "${truncate(placeholder, 30)}"`;
    if (aria) return `${tag} [${aria}]`;
    if (name) return `${tag} [${name}]`;
    if (tag === 'input') return `${el.getAttribute('type') ?? 'text'} input`;
    return tag;
  }
  if (/^h[1-6]$/.test(tag)) return text ? `${tag} "${truncate(text, 40)}"` : tag;
  if (tag === 'img') {
    const alt = el.getAttribute('alt');
    return alt ? `image "${truncate(alt, 30)}"` : 'image';
  }
  if (tag === 'svg') return 'icon';
  if (aria) return `${tag} [${aria}]`;
  if (text && text.length <= TEXT_TRUNCATE) return `${tag} "${truncate(text, 40)}"`;
  const cls = meaningfulClass(el);
  if (cls) return cls;
  return tag === 'div' ? 'container' : tag;
}

/** Readable ancestry path, at most `maxDepth` meaningful segments. */
export function elementPath(el: HTMLElement, maxDepth = 4): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && parts.length < maxDepth) {
    const tag = current.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') break;
    if (current.id) {
      parts.unshift(`#${current.id}`);
    } else {
      const cls = meaningfulClass(current);
      parts.unshift(cls ? `.${cls}` : tag);
    }
    current = current.parentElement;
  }
  return parts.join(' > ');
}

/**
 * A CSS selector that resolves back to `el`. Prefers a unique `#id`; otherwise
 * builds a `:nth-of-type` chain upward, stopping as soon as the partial chain
 * is unique in the document.
 */
export function computeUniqueSelector(el: HTMLElement): string {
  const doc = el.ownerDocument;
  if (el.id) {
    const byId = `#${cssEscape(el.id)}`;
    if (doc.querySelectorAll(byId).length === 1) return byId;
  }

  const segments: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current.tagName.toLowerCase() !== 'html') {
    const tag = current.tagName.toLowerCase();
    if (current.id) {
      segments.unshift(`${tag}#${cssEscape(current.id)}`);
      break;
    }
    let segment = tag;
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (child) => child.tagName === current?.tagName,
      );
      if (sameTagSiblings.length > 1) {
        segment += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    segments.unshift(segment);
    const candidate = segments.join(' > ');
    if (doc.querySelectorAll(candidate).length === 1) return candidate;
    current = parent;
  }
  return segments.join(' > ');
}

/** Full capture for a picked element — everything the pill and the LLM need. */
export function capturePickedElement(el: HTMLElement): PickedElement {
  const rect = el.getBoundingClientRect();
  const text = cleanText(el);
  return {
    name: identifyElementName(el),
    path: elementPath(el),
    selector: computeUniqueSelector(el),
    tag: el.tagName.toLowerCase(),
    text: text ? truncate(text, 200) : undefined,
    pageUrl: el.ownerDocument.defaultView?.location.href ?? '',
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

/**
 * True for nodes that belong to the widget itself (embed root, host-portaled
 * chrome, picker overlay) — the picker and the highlighter must never target
 * our own UI.
 */
export function isWidgetOwnedElement(el: Element): boolean {
  return (
    el.closest('#opencx-root, [data-opencx-root], [data-opencx-picker-overlay]') !==
    null
  );
}

/**
 * The pickable element under a viewport point: pierces open shadow roots
 * (elementFromPoint stops at shadow hosts) and refuses widget-owned nodes and
 * the page chrome (`html`/`body`).
 */
export function pickableElementAt(x: number, y: number): HTMLElement | null {
  let element = document.elementFromPoint(x, y);
  while (element?.shadowRoot) {
    const deeper = element.shadowRoot.elementFromPoint(x, y);
    if (!deeper || deeper === element) break;
    element = deeper;
  }
  if (!(element instanceof HTMLElement)) return null;
  if (isWidgetOwnedElement(element)) return null;
  const tag = element.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return null;
  return element;
}

/**
 * Find an element again from an LLM-provided hint: try the CSS selector first
 * (invalid model-authored selectors are non-fatal), then fall back to the
 * smallest element whose text contains the hint text.
 */
export function resolveElementByHint(hint: {
  selector?: string;
  text?: string;
}): HTMLElement | null {
  if (hint.selector) {
    try {
      const el = document.querySelector(hint.selector);
      if (el instanceof HTMLElement && !isWidgetOwnedElement(el)) return el;
    } catch {
      // Model-authored selector didn't parse — fall through to text search.
    }
  }

  const needle = hint.text?.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!needle) return null;

  let best: HTMLElement | null = null;
  let bestLength = Number.POSITIVE_INFINITY;
  const all = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;
    if (isWidgetOwnedElement(el)) continue;
    const text = cleanText(el).toLowerCase();
    if (!text.includes(needle)) continue;
    // `<=` so the DEEPEST element wins ties (querySelectorAll is document
    // order, parents before children with identical text).
    if (text.length <= bestLength) {
      best = el;
      bestLength = text.length;
    }
  }
  return best;
}
