import { resolveRef } from './control-ref';

/**
 * The check that runs immediately before the widget touches a control —
 * before it draws a mark, and (later) before it clicks.
 *
 * Between the reading that produced a reference and the tool call that uses
 * it, a page can do anything: re-render, scroll, open a modal over the top.
 * So the reference is not trusted as a permission to act; it is looked up,
 * and then the element itself is asked three questions. Each "no" is a
 * distinct answer, because the agent has to be able to say which one
 * happened — "it is behind the dialog that just opened" is useful, "it
 * didn't work" is not.
 */
export type GuardOutcome =
  /** The element is there, visible, and the topmost thing at its own centre. */
  | { ok: true; element: HTMLElement }
  /** The reference means nothing here: never minted, expired, or detached. */
  | { ok: false; reason: 'gone' }
  /** Still in the document, but not on screen. */
  | { ok: false; reason: 'hidden' }
  /** On screen, but something else is in front of it. */
  | { ok: false; reason: 'covered' };

/**
 * Is this element the thing a visitor would actually hit at that spot? The
 * centre point is the honest probe: it is where a person aims, and what a
 * real click would land on. A hit on a descendant (the label inside the
 * button) or an ancestor that fully contains it counts — that is still the
 * control. Anything else means something is in front.
 */
function isTopmost(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  // Off-screen (scrolled away) is not covered — nothing is in front of it,
  // it is simply elsewhere, and callers scroll it into view before acting.
  const doc = el.ownerDocument;
  const viewportWidth = doc.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = doc.documentElement.clientHeight || window.innerHeight;
  if (x < 0 || y < 0 || x > viewportWidth || y > viewportHeight) return true;

  // Without the probe there is no evidence of anything in front, and
  // absence of evidence must not read as "covered" — every real browser
  // has it; layout-less test environments do not.
  if (typeof doc.elementFromPoint !== 'function') return true;
  const hit = doc.elementFromPoint(x, y);
  if (!hit) return true;
  return hit === el || el.contains(hit) || hit.contains(el);
}

/** Look a reference up and ask the element whether it can be touched. */
export function guardRef(ref: string): GuardOutcome {
  const element = resolveRef(ref);
  if (!element) return { ok: false, reason: 'gone' };

  const visible =
    typeof element.checkVisibility === 'function'
      ? element.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      : element.isConnected;
  const rect = element.getBoundingClientRect();
  if (!visible || rect.width === 0 || rect.height === 0) {
    return { ok: false, reason: 'hidden' };
  }

  if (!isTopmost(element)) return { ok: false, reason: 'covered' };

  return { ok: true, element };
}
