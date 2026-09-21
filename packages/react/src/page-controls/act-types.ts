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

/**
 * Actions that COMMIT something on the customer's behalf — money moves, a
 * record is destroyed, a form is submitted. These never happen without the
 * visitor saying yes to that exact control, first.
 *
 * Recognised from what the control IS and what it SAYS, because that is all
 * a page reliably tells us. It over-includes on purpose: asking about a
 * harmless "Apply filters" button costs one chip, and not asking about
 * "Delete account" costs an account.
 */
export const COMMITTING_WORDS =
  /\b(pay|payment|purchase|buy|checkout|order|subscribe|renew|confirm|submit|send|delete|remove|cancel|terminate|close account|deactivate|transfer|withdraw|apply|accept|agree|sign|authori[sz]e|publish|deploy|archive|reset|revoke)\b/i;

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

/**
 * How long the page gets to react before we look at what changed. Long
 * enough for a re-render, a menu to open or a fetch to come back on a local
 * network; short enough that the turn's round trip stays under its budget.
 */
export const SETTLE_MS = 500;

/**
 * Controls the widget will never act on, whatever the agent asks and
 * whatever the visitor allows. A password or a file picker is not something
 * an agent types into, and a control inside a cross-origin frame is not
 * something this page can honestly report on.
 */
export const NEVER_ACT_INPUT_TYPES = new Set(['password', 'file', 'hidden']);
