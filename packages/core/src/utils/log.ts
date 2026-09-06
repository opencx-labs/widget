/**
 * The widget runs inside customers' pages, so every line it writes to the
 * console carries one attributable prefix. Use this instead of `console.*`.
 */
const PREFIX = '[opencx]';

export const log = {
  warn: (message: string, ...details: unknown[]): void => {
    console.warn(`${PREFIX} ${message}`, ...details);
  },
  error: (message: string, ...details: unknown[]): void => {
    console.error(`${PREFIX} ${message}`, ...details);
  },
};
