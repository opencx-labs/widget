/**
 * The page vocabulary shared by every mark on the host page — the visitor's
 * (`page-mark.ts`) and the agent's (`agent-mark.ts`).
 *
 * The widget's React code runs in the HOST page realm (only the chat UI is
 * portaled into a same-origin iframe), so `document` here is the host page
 * document — these helpers read the customer's page directly.
 */

/** A viewport-relative box, rounded to whole pixels. */
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * How one host-page element is described to the AI. Deliberately the minimum
 * that carries meaning: a name to reason about, a selector to point back at
 * (`highlight_element`), the tag, and the visible text.
 */
export type MarkedElement = {
  /** Human-readable name, e.g. `button "Create Key"`. */
  name: string;
  /** Resolvable CSS selector (verified unique against the document). */
  selector: string;
  /** Lowercased tag name. */
  tag: string;
  /** The element's own visible text, truncated. */
  text?: string;
};

const TEXT_TRUNCATE = 60;

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
    .find(
      (c) => c.length > 2 && !/^[a-z]{1,2}$/.test(c) && !/[A-Z0-9]{5,}/.test(c),
    );
  return cls ?? null;
}

/**
 * Human-readable name for an element — what the context pill shows and what
 * the LLM reads. Buttons are named by their text, inputs by placeholder/name,
 * images by alt.
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
  if (/^h[1-6]$/.test(tag))
    return text ? `${tag} "${truncate(text, 40)}"` : tag;
  if (tag === 'img') {
    const alt = el.getAttribute('alt');
    return alt ? `image "${truncate(alt, 30)}"` : 'image';
  }
  if (tag === 'svg') return 'icon';
  if (aria) return `${tag} [${aria}]`;
  if (text && text.length <= TEXT_TRUNCATE)
    return `${tag} "${truncate(text, 40)}"`;
  const cls = meaningfulClass(el);
  if (cls) return cls;
  return tag === 'div' ? 'container' : tag;
}

/**
 * Belt-and-braces uniqueness probe: `CSS.escape` output is always a valid
 * selector, but an invalid one must degrade to "not unique", never throw.
 */
function isUniqueInDocument(doc: Document, selector: string): boolean {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/**
 * A CSS selector that resolves back to `el`. Prefers a unique `#id`; otherwise
 * builds a `:nth-of-type` chain upward, stopping as soon as the partial chain
 * is unique in the document.
 */
export function computeUniqueSelector(el: HTMLElement): string {
  const doc = el.ownerDocument;
  if (el.id) {
    const byId = `#${CSS.escape(el.id)}`;
    if (isUniqueInDocument(doc, byId)) return byId;
  }

  const segments: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current.tagName.toLowerCase() !== 'html') {
    const tag = current.tagName.toLowerCase();
    if (current.id) {
      segments.unshift(`${tag}#${CSS.escape(current.id)}`);
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
    if (isUniqueInDocument(doc, candidate)) return candidate;
    current = parent;
  }
  return segments.join(' > ');
}

/** The element's viewport-relative bounding box, rounded to whole pixels. */
export function rectOf(el: Element): Rect {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/**
 * Breathing room kept between a mark's box and the viewport edge: the hover
 * frame inflates the rect by 4px and paints a ~4px ring outside that, which
 * is also enough for the ink's stroke and its wobble.
 */
export const VIEWPORT_MARGIN_PX = 8;

/**
 * Clamp a viewport rect so everything drawn around it stays on the page. An
 * element taller or wider than the viewport — a full-height sidebar, a wide
 * table — otherwise gets a frame whose edges land outside the visible page,
 * and the visitor sees a border running off the screen instead of a box.
 */
export function clampRectToViewport(
  rect: Rect,
  margin: number = VIEWPORT_MARGIN_PX,
): Rect {
  // `clientWidth` excludes the scrollbar (and is 0 in layout-less
  // environments, where `innerWidth` is the only answer available).
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight =
    document.documentElement.clientHeight || window.innerHeight;
  const left = Math.max(rect.x, margin);
  const top = Math.max(rect.y, margin);
  const right = Math.min(rect.x + rect.width, viewportWidth - margin);
  const bottom = Math.min(rect.y + rect.height, viewportHeight - margin);
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(Math.max(0, right - left)),
    height: Math.round(Math.max(0, bottom - top)),
  };
}

/** Describe an element for the AI. */
export function describeElement(el: HTMLElement): MarkedElement {
  const text = cleanText(el);
  return {
    name: identifyElementName(el),
    selector: computeUniqueSelector(el),
    tag: el.tagName.toLowerCase(),
    text: text ? truncate(text, 200) : undefined,
  };
}

/**
 * The single source of truth for "this node belongs to the widget": the embed
 * root, host-portaled chrome, and every mark overlay. Both the `closest()`
 * ownership check below and the mark-mode cursor's injected `:not()` chain
 * derive from this list — add new widget-owned markers HERE.
 */
export const WIDGET_OWNED_SELECTOR = [
  '#opencx-root',
  '[data-opencx-root]',
  '[data-opencx-overlay]',
] as const;

const WIDGET_OWNED_CLOSEST = WIDGET_OWNED_SELECTOR.join(', ');

/**
 * True for nodes that belong to the widget itself — no mark may ever target
 * the widget's own UI.
 */
export function isWidgetOwned(el: Element): boolean {
  return el.closest(WIDGET_OWNED_CLOSEST) !== null;
}

/**
 * The markable element under a viewport point. Keep the hit in the document
 * tree: selectors serialized into page-mark context must resolve through
 * `document.querySelector`, so piercing a shadow root would create an element
 * the selector contract cannot point back to. SVG children normalize to their
 * nearest semantic HTML control (or nearest HTML owner).
 */
export function elementAt(x: number, y: number): HTMLElement | null {
  let hit = document.elementFromPoint(x, y);
  if (!hit) return null;
  const root = hit.getRootNode();
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
    hit = root.host;
  }
  const semanticOwner = hit.closest(
    'button, a, input, textarea, select, [role="button"], [role="link"]',
  );
  let element: Element | null = semanticOwner ?? hit;
  while (element && !(element instanceof HTMLElement)) {
    element = element.parentElement;
  }
  if (!(element instanceof HTMLElement)) return null;
  if (isWidgetOwned(element)) return null;
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
      if (el instanceof HTMLElement && !isWidgetOwned(el)) return el;
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
    if (isWidgetOwned(el)) continue;
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
