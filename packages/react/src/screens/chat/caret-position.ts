/**
 * Where a character index sits inside a textarea, in the textarea's own
 * coordinates. Textareas expose no caret geometry, so the text up to the
 * index is laid out again in a throwaway element wearing the same font,
 * padding, width and wrapping rules; a marker at its end is where the
 * character would be. Returns null when there is no layout (tests, SSR).
 */
export function caretPositionInTextarea(
  textarea: HTMLTextAreaElement,
  index: number,
): { left: number; top: number } | null {
  const doc = textarea.ownerDocument;
  const view = doc.defaultView;
  if (!view) return null;
  const mirror = doc.createElement('div');
  copyTextLayoutStyles(textarea, mirror);
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    height: 'auto',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    width: `${textarea.clientWidth}px`,
  } satisfies Partial<CSSStyleDeclaration>);
  mirror.textContent = textarea.value.slice(0, index);
  const marker = doc.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  doc.body.appendChild(mirror);
  const left = marker.offsetLeft;
  const top = marker.offsetTop - textarea.scrollTop;
  mirror.remove();
  return { left, top };
}

/**
 * Give `target` the font, spacing and padding `textarea` resolved to — the
 * embedder's `cssOverrides` included — so text laid out in it lands where
 * the textarea lays it out. The composer's mention mirror needs this on every
 * render, the caret probe once.
 */
export function copyTextLayoutStyles(
  textarea: HTMLTextAreaElement,
  target: HTMLElement,
): void {
  const view = textarea.ownerDocument.defaultView;
  if (!view) return;
  const style = view.getComputedStyle(textarea);
  for (const prop of MIRRORED_STYLES) {
    target.style.setProperty(prop, style.getPropertyValue(prop));
  }
}

const MIRRORED_STYLES = [
  'box-sizing',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'line-height',
  'text-transform',
  'text-indent',
  'word-spacing',
  'tab-size',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
] as const;
