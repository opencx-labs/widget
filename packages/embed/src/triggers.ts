export type TriggerAction =
  | { kind: 'open' }
  | { kind: 'prefill'; value: string }
  | { kind: 'ask'; value: string }
  | { kind: 'answer'; value: string };

export const TRIGGER_SELECTOR =
  '[data-opencx-open],[data-opencx-prefill],[data-opencx-ask],[data-opencx-answer]';

/**
 * Resolves the OpenCX trigger action for a clicked element (or its nearest
 * trigger ancestor). Returns `null` when the target is not a trigger.
 * Precedence when several attributes are present: prefill > ask > answer > open.
 */
export function resolveTriggerAction(
  target: EventTarget | null,
): TriggerAction | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(TRIGGER_SELECTOR);
  if (!el) return null;

  const prefill = el.getAttribute('data-opencx-prefill');
  if (prefill !== null) return { kind: 'prefill', value: prefill };

  const ask = el.getAttribute('data-opencx-ask');
  if (ask !== null) return { kind: 'ask', value: ask };

  const answer = el.getAttribute('data-opencx-answer');
  if (answer !== null) return { kind: 'answer', value: answer };

  return { kind: 'open' };
}
