/**
 * The accessible name of a control — the words a screen reader would say.
 *
 * This is the whole point of reading the page: a customer says "the Change
 * plan button", and the only way that matches a node is if we resolved the
 * name the same way their browser does. A CSS class or a tag name is not a
 * name; `aria-label`, a `<label>`, a `placeholder` and the visible text are.
 *
 * A trimmed-down accname resolution, in spec order for the cases that occur
 * on real pages: aria-labelledby → aria-label → the native label (label
 * element, legend, alt, title-of-image) → visible text → placeholder →
 * title. `value` is NEVER a name source, even where the spec allows it for
 * buttons, because an `<input type="submit" value="…">` is the one place
 * where a field's value and its name are the same string, and letting it
 * through would make "no values" depend on an input type.
 */

const NAME_MAX = 120;

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

const truncate = (text: string): string =>
  text.length > NAME_MAX ? `${text.slice(0, NAME_MAX)}…` : text;

/**
 * Text content, minus anything explicitly hidden from assistive tech, with
 * block boundaries kept as spaces.
 *
 * `textContent` concatenates with nothing between, so a real dashboard's
 * banner read as "2 open disputesRespond before the deadline…" — one word
 * where a person sees two lines, and a name the agent cannot match against
 * anything the customer would say. Browsers insert a space at a block
 * boundary when they compute a name; so does this.
 */
const BLOCK_LEVEL =
  'address,article,aside,blockquote,br,dd,details,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,summary,table,td,th,tr,ul';

function visibleText(el: Element): string {
  const clone = el.cloneNode(true);
  if (!(clone instanceof Element)) return '';
  clone
    .querySelectorAll('[aria-hidden="true"], script, style, noscript')
    .forEach((hidden) => hidden.remove());
  clone
    .querySelectorAll(BLOCK_LEVEL)
    .forEach((block) => block.insertAdjacentText('beforebegin', ' '));
  return collapse(clone.textContent ?? '');
}

/** The `<label>`s a form control is wired to, native or `for`-attached. */
function labelText(el: HTMLElement): string {
  const labelled =
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
      ? el.labels
      : null;
  const text = labelled
    ? Array.from(labelled)
        .map((label) => visibleText(label))
        .join(' ')
    : '';
  if (text) return collapse(text);
  const fieldset = el.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  return legend ? visibleText(legend) : '';
}

/**
 * Resolve the name. Returns '' when the control has none — a nameless
 * control is one the agent cannot talk about, so the reader drops it rather
 * than inventing a name out of markup.
 */
export function accessibleName(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id))
      .filter((node): node is HTMLElement => node !== null)
      .map((node) => visibleText(node))
      .filter(Boolean)
      .join(' ');
    if (text) return truncate(collapse(text));
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return truncate(collapse(ariaLabel));

  const tag = el.tagName.toLowerCase();

  if (tag === 'img') {
    const alt = el.getAttribute('alt');
    if (alt?.trim()) return truncate(collapse(alt));
  }

  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    const label = labelText(el);
    if (label) return truncate(label);
    const placeholder = el.getAttribute('placeholder');
    if (placeholder?.trim()) return truncate(collapse(placeholder));
    const title = el.getAttribute('title');
    if (title?.trim()) return truncate(collapse(title));
    return '';
  }

  const text = visibleText(el);
  if (text) return truncate(text);

  const title = el.getAttribute('title');
  if (title?.trim()) return truncate(collapse(title));

  return '';
}
