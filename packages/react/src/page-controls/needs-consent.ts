import { accessibleName } from './accessible-name';
import { COMMITTING_WORDS, type PageAction } from './act-types';

/**
 * Does this need the visitor to say yes first?
 *
 * Yes for anything that commits: a payment, a deletion, a form going in.
 * The test is what the control says and what it is — a submit button, or a
 * name with a committing word in it — because that is all a page reliably
 * offers, and because the customer reading "Delete account" is the one who
 * understands what it means here.
 *
 * Deliberately over-inclusive. A chip the visitor did not strictly need
 * costs one tap; a missing chip costs whatever the button did.
 */
export function needsConsent(el: HTMLElement, action: PageAction): boolean {
  // Typing into a field commits nothing on its own — the button after it
  // does, and that button gets its own chip.
  if (action === 'fill' || action === 'select') return false;

  if (el instanceof HTMLInputElement && el.type === 'submit') return true;
  // `button.type` is 'submit' for EVERY plain button — the property carries
  // the default, so reading it would make every button on the page a
  // committing one. What actually submits is a button inside a form whose
  // type is not explicitly 'button'.
  if (el instanceof HTMLButtonElement && el.closest('form') !== null) {
    const declared = el.getAttribute('type')?.toLowerCase();
    if (declared !== 'button' && declared !== 'reset') return true;
  }

  return COMMITTING_WORDS.test(accessibleName(el));
}
