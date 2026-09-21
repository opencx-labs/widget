/**
 * What the agent knows about the controls on the customer's page.
 *
 * The widget reads the page itself and sends NAMES. The elements never
 * leave the browser: each one is held here behind an opaque reference, and
 * every later instruction — point at this, click that — comes back as one of
 * those references. Nothing the agent says can name a node we did not offer
 * it in this turn.
 *
 * What is deliberately absent: values. Not the text in a field, not the
 * option a select is on, not a password, not a file name. A support agent
 * needs to know that a "Change plan" button exists and is greyed out; it
 * never needs to know what the visitor typed into "Card number".
 */

/** One control on the host page, as the agent reads it. */
export type PageControl = {
  /** Opaque handle for this turn. The agent points with it; only we resolve it. */
  ref: string;
  /** What the control IS: button, link, textbox, checkbox, … (ARIA role). */
  role: string;
  /** The control's accessible name — the words a screen reader would say. */
  name: string;
  /** Present and true only when the control cannot be used right now. */
  disabled?: true;
};

/** One turn's reading of the page: the controls, and the table behind them. */
export type PageControlSnapshot = {
  controls: PageControl[];
  /** Whether the page had more controls than the cap allowed us to send. */
  truncated: boolean;
};

/**
 * Attribute a customer puts on any part of their page the agent must never
 * read. Everything inside is skipped whole — the control, its name, its
 * existence. The one thing a page owner can say that the reader obeys
 * without interpretation.
 */
export const PRIVATE_REGION_ATTRIBUTE = 'data-opencx-private';

/**
 * Input types the reader refuses on sight, whatever else is true about them:
 * a password is never described, and a file picker's name can carry the
 * visitor's own file names.
 */
export const NEVER_READ_INPUT_TYPES = new Set(['password', 'file', 'hidden']);

/**
 * How many controls one message carries. A page with more than this is read
 * in full (so the cap applies to the busiest part, not a random prefix) but
 * sends only the first `MAX_CONTROLS` in document order, and says so.
 * Chosen against the prompt, not the DOM: 300 names is roughly 3k tokens.
 */
export const MAX_CONTROLS = 300;
