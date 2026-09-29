/** Shared privacy boundary for page names, marks and captures. */
export const WIDGET_OWNED_SELECTOR = [
  '#opencx-root',
  '[data-opencx-root]',
  '[data-opencx-overlay]',
] as const;

export const PAGE_VALUE_SELECTOR =
  'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="searchbox"],[role="combobox"]';

const PRIVATE_SELECTOR = [
  ...WIDGET_OWNED_SELECTOR,
  '[data-opencx-private]',
  '[aria-hidden="true"]',
  '[hidden]',
  'script',
  'style',
  'noscript',
].join(',');

function isSelfPrivate(el: Element): boolean {
  if (el.matches(PRIVATE_SELECTOR)) return true;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return (
    style?.display === 'none' ||
    style?.visibility === 'hidden' ||
    style?.visibility === 'collapse' ||
    style?.opacity === '0'
  );
}

export function isPageElementPrivate(el: Element): boolean {
  for (
    let current: Element | null = el;
    current;
    current = current.parentElement
  ) {
    if (isSelfPrivate(current)) return true;
  }
  return false;
}

/** Read from live nodes so CSS and private ancestors/referenced labels apply. */
export function safePageText(el: Element): string {
  if (isPageElementPrivate(el) || el.closest(PAGE_VALUE_SELECTOR)) return '';
  const chunks: string[] = [];
  const visit = (node: Node) => {
    if (node instanceof Element) {
      // Ancestors were checked on entry; private subtrees are never visited.
      // Each style is read once, with no cache surviving this live traversal.
      if (
        (node !== el && isSelfPrivate(node)) ||
        node.matches(PAGE_VALUE_SELECTOR)
      )
        return;
      const block =
        /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DETAILS|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|SUMMARY|TABLE|TD|TH|TR|UL)$/.test(
          node.tagName,
        );
      if (block) chunks.push(' ');
      node.childNodes.forEach(visit);
      if (block) chunks.push(' ');
    } else if (node.nodeType === Node.TEXT_NODE)
      chunks.push(node.textContent ?? '');
  };
  visit(el);
  return chunks.join('').replace(/\s+/g, ' ').trim();
}

/** URL metadata never includes credentials, query parameters or fragments. */
export function safePageUrl(value: string): string {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? `${url.origin}${url.pathname}`
      : '';
  } catch {
    return '';
  }
}

/** Form values and opaque embedded pixels cannot be reliably redacted. */
export function canCapturePageElement(el: Element): boolean {
  return (
    el.getRootNode() === document &&
    !isPageElementPrivate(el) &&
    !el.closest(PAGE_VALUE_SELECTOR) &&
    !el.matches('canvas,iframe,video,object,embed') &&
    !Array.from(el.querySelectorAll('*')).some(
      (node) =>
        isPageElementPrivate(node) ||
        node.matches(`${PAGE_VALUE_SELECTOR},canvas,iframe,video,object,embed`),
    )
  );
}
