import { accessibleName } from './accessible-name';
import { beginSnapshot } from './control-ref';
import { offLimitsReason } from './off-limits';
import {
  MAX_CONTROLS,
  type PageControl,
  type PageControlSnapshot,
} from './types';

/**
 * Read the controls the visitor can actually see and use, once, at send time.
 *
 * "Can see and use" is the whole filter, and it is what keeps this honest:
 * a control behind `display:none`, a password field, anything inside a
 * region the customer marked private, and the widget's own UI are not on the
 * page as far as the agent is concerned. A nameless control is dropped too —
 * the agent can only talk about what it can name.
 *
 * Runs on the send path, so it must not cost a frame: one selector query,
 * one visibility check and one name resolution per hit, no layout thrash,
 * and a hard stop once the cap is reached.
 */

/**
 * Everything a person can operate. Roles are included as well as tags,
 * because a real application's "button" is as often a `div[role=button]`.
 */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[role="textbox"]',
  '[role="searchbox"]',
].join(',');

/**
 * Rows, cards and list items that a page has made clickable without saying
 * so in its markup.
 *
 * A React `onClick` on a `<tr>` cannot be seen from the DOM — there is no
 * API for it — so a table of settlements looks exactly like a table of
 * text, and an agent asked to open one has nothing to offer but the
 * navigation. That is not a hypothetical: it is what happens on the first
 * real screen this was pointed at.
 *
 * `cursor: pointer` is the signal, and it is not a guess. It is the page
 * telling the visitor, in the only way a page can, that this responds to a
 * click — the same thing a sighted person reads before they click it. We
 * take the page at its word rather than inferring anything about handlers.
 *
 * Bounded on purpose: only containers that hold a row of content, and only
 * when they contain no real control of their own, because then the control
 * is what should be offered, not its wrapper.
 */
const CLICKABLE_CONTAINER_SELECTOR = [
  'tr',
  'li',
  '[role="row"]',
  '[role="listitem"]',
  '[role="gridcell"]',
  '[tabindex]',
  '[onclick]',
].join(',');

/** A cap on style reads, so a huge table cannot cost the send path a frame. */
const MAX_STYLE_PROBES = 400;

function looksClickable(el: HTMLElement): boolean {
  try {
    return (
      el.ownerDocument.defaultView?.getComputedStyle(el).cursor === 'pointer'
    );
  } catch {
    return false;
  }
}

/** Tag → the role a browser would report, for the elements we collect. */
function roleOf(el: HTMLElement): string {
  const explicit = el.getAttribute('role');
  if (explicit?.trim()) return explicit.trim().toLowerCase();
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button' || type === 'reset') {
      return 'button';
    }
    if (type === 'range') return 'slider';
    if (type === 'search') return 'searchbox';
    return 'textbox';
  }
  return 'textbox';
}

/**
 * What to call a clickable container. A row is a row; calling it a button
 * would tell the agent it is something it is not.
 */
function containerRoleOf(el: HTMLElement): string {
  const explicit = el.getAttribute('role');
  if (explicit?.trim()) return explicit.trim().toLowerCase();
  const tag = el.tagName.toLowerCase();
  if (tag === 'tr') return 'row';
  if (tag === 'li') return 'listitem';
  return 'button';
}

/**
 * Is this control on screen? `checkVisibility` answers the CSS half
 * natively and cheaply; a zero-area box catches the rest (a control clipped
 * to nothing, or in a collapsed container).
 */
function isVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') {
    if (
      !el.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      })
    ) {
      return false;
    }
  } else if (!el.isConnected) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isDisabled(el: HTMLElement): boolean {
  if ('disabled' in el && el.disabled === true) return true;
  return el.getAttribute('aria-disabled') === 'true';
}

/** Read the host page's controls for this turn. Never throws. */
export function readPageControls(
  doc: Document = document,
): PageControlSnapshot {
  const controls: PageControl[] = [];
  const seen = new Set<HTMLElement>();
  let truncated = false;
  try {
    const mint = beginSnapshot();
    const candidates = Array.from(
      doc.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR),
    );
    for (const el of candidates) {
      if (offLimitsReason(el)) continue;
      if (!isVisible(el)) continue;
      const name = accessibleName(el);
      if (!name) continue;
      if (controls.length >= MAX_CONTROLS) {
        truncated = true;
        break;
      }
      const control: PageControl = { ref: mint(el), role: roleOf(el), name };
      if (isDisabled(el)) control.disabled = true;
      controls.push(control);
      seen.add(el);
    }

    // Second pass: the rows and cards the page made clickable with style
    // rather than with markup. Cheap checks first, the style read last.
    let probes = 0;
    if (!truncated) {
      const containers = Array.from(
        doc.querySelectorAll<HTMLElement>(CLICKABLE_CONTAINER_SELECTOR),
      );
      for (const el of containers) {
        if (controls.length >= MAX_CONTROLS) {
          truncated = true;
          break;
        }
        if (probes >= MAX_STYLE_PROBES) break;
        if (seen.has(el)) continue;
        if (offLimitsReason(el)) continue;
        // A wrapper around a real control is not itself the control: offer
        // the button, not the cell it sits in.
        if (el.querySelector(INTERACTIVE_SELECTOR)) continue;
        if (!isVisible(el)) continue;
        const name = accessibleName(el);
        if (!name) continue;
        probes += 1;
        if (!looksClickable(el)) continue;
        controls.push({ ref: mint(el), role: containerRoleOf(el), name });
        seen.add(el);
      }
    }
  } catch {
    // Reading the page is a courtesy; a hostile or exotic DOM must never
    // stop the customer's message from being sent.
    return { controls: [], truncated: false };
  }
  return { controls, truncated };
}
