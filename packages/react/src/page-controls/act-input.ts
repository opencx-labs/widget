import { z } from 'zod';
import { PAGE_ACTIONS } from './act-types';

/**
 * What the agent is allowed to ask for. `ref` is the only way to name a
 * control — there is no selector and no text — and the action set is closed,
 * so an invented verb is refused rather than interpreted.
 */
export const actOnPageInputSchema = z.object({
  ref: z.string().min(1),
  action: z.enum(PAGE_ACTIONS),
  /** What to type or which option to choose. Never a password. */
  value: z.string().max(500).optional(),
});
