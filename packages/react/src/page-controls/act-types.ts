/**
 * Doing something on the customer's page, and knowing whether it happened.
 *
 * The rule that shapes all of this: the agent may only report what the page
 * actually did. Firing a click is easy; knowing whether the click DID
 * anything is the work, and it is the difference between "I've cancelled
 * your subscription" and the truth.
 */

/** What the agent can do to a control. Deliberately small. */
export const PAGE_ACTIONS = [
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
] as const;
export type PageAction = (typeof PAGE_ACTIONS)[number];

/** The answer, in the same words the server and the agent use. */
export type ActOutcome =
  | 'done'
  | 'covered'
  | 'gone'
  | 'hidden'
  | 'unsupported'
  | 'no_change'
  | 'declined';

export type ActResult = {
  outcome: ActOutcome;
  /** One short sentence for the agent to pass on. Never page text. */
  detail?: string;
};

/** Maximum observation window; visible aria-busy regions defer quiet completion. */
export const SETTLE_MS = 3_000;

/**
 * Controls the widget will never act on, whatever the agent asks and
 * whatever the visitor allows. A password or a file picker is not something
 * an agent types into, and a control inside a cross-origin frame is not
 * something this page can honestly report on.
 */
export const NEVER_ACT_INPUT_TYPES = new Set(['password', 'file', 'hidden']);
