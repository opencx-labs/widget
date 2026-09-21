import { isWidgetOwned } from '../page-marks/page-element';
import { NEVER_READ_INPUT_TYPES, PRIVATE_REGION_ATTRIBUTE } from './types';

/**
 * The one list of things the agent may never read, point at or touch —
 * checked when the page is read AND again in the instant before anything
 * happens.
 *
 * Twice, because the two moments are not the same moment. An application
 * marks its card form private when that form mounts, which can be after the
 * message was sent; a dialog becomes `aria-hidden` behind a newer one. A
 * reference minted before any of that still resolves, so a rule enforced
 * only at read time is a rule with a window in it.
 */
export type OffLimitsReason =
  | 'private'
  | 'hidden-from-assistive-tech'
  | 'credential-field'
  | 'widget-owned';

export function offLimitsReason(el: HTMLElement): OffLimitsReason | null {
  if (isWidgetOwned(el)) return 'widget-owned';
  if (el.closest(`[${PRIVATE_REGION_ATTRIBUTE}]`)) return 'private';
  if (el.getAttribute('aria-hidden') === 'true')
    return 'hidden-from-assistive-tech';
  if (el.closest('[aria-hidden="true"]')) return 'hidden-from-assistive-tech';
  if (el.tagName.toLowerCase() === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (NEVER_READ_INPUT_TYPES.has(type)) return 'credential-field';
  }
  return null;
}

/** What to tell the agent, without describing what it was kept away from. */
export const OFF_LIMITS_DETAIL: Record<OffLimitsReason, string> = {
  private:
    'That part of the page is marked private and the agent never reads or uses it.',
  'hidden-from-assistive-tech':
    'That control is hidden from assistive technology, so it is not treated as being on the page.',
  'credential-field':
    'Password and file fields are never filled or clicked by the agent.',
  'widget-owned': 'That is part of the chat widget, not the page.',
};
