export type TriggerAction =
  | { kind: 'open' }
  | { kind: 'prefill'; value: string }
  | { kind: 'ask'; value: string }
  | { kind: 'answer'; value: string };

export const TRIGGER_SELECTOR =
  '[opencx-open],[opencx-prefill],[opencx-ask],[opencx-answer],' +
  '[data-opencx-open],[data-opencx-prefill],[data-opencx-ask],[data-opencx-answer]';

/** Reads `opencx-*`, falling back to the `data-opencx-*` form. */
function triggerAttribute(el: Element, name: string): string | null {
  return el.getAttribute(`opencx-${name}`) ?? el.getAttribute(`data-opencx-${name}`);
}

/**
 * Resolves the OpenCX trigger action for a clicked element (or its nearest
 * trigger ancestor). Returns `null` when the target is not a trigger.
 * The documented attributes are `opencx-*`; the `data-opencx-*` form is also
 * accepted for hosts that need HTML-validator-clean markup.
 * Precedence when several attributes are present: prefill > ask > answer > open.
 */
export function resolveTriggerAction(
  target: EventTarget | null,
): TriggerAction | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(TRIGGER_SELECTOR);
  if (!el) return null;

  const prefill = triggerAttribute(el, 'prefill');
  if (prefill !== null) return { kind: 'prefill', value: prefill };

  const ask = triggerAttribute(el, 'ask');
  if (ask !== null) return { kind: 'ask', value: ask };

  const answer = triggerAttribute(el, 'answer');
  if (answer !== null) return { kind: 'answer', value: answer };

  return { kind: 'open' };
}
