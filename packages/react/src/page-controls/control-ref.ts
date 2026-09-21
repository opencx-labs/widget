/**
 * The table behind the references — held here, in the page, never sent.
 *
 * Every control the agent can talk about is one the reader put in this table
 * in this turn. The wire carries `c7`; only this module knows which node
 * that is. Three properties fall out of that, and they are the reason the
 * table exists instead of the agent authoring CSS selectors:
 *
 * - The agent cannot reach a node we did not offer it. There is no selector
 *   to widen, no text to guess at, no way to name the password field we
 *   skipped.
 * - A reference is checkable. Before drawing or clicking, `resolve` says
 *   whether that exact node is still in the document — a stale reference
 *   after a re-render is a "no", not a click on whatever moved into place.
 * - The nodes are held weakly, so a table entry never keeps a detached
 *   subtree of the customer's page alive.
 */

/** How many readings stay resolvable. The current one, and the one before
 * it — long enough for a tool call issued against the snapshot that was sent
 * with the message to still land after the page re-rendered once. */
const GENERATIONS_KEPT = 2;

type Generation = Map<string, WeakRef<HTMLElement>>;

const generations: Generation[] = [];
let sequence = 0;

/** Open a new reading. Returns the mint function for its references. */
export function beginSnapshot(): (el: HTMLElement) => string {
  const generation: Generation = new Map();
  generations.unshift(generation);
  generations.length = Math.min(generations.length, GENERATIONS_KEPT);
  let n = 0;
  const prefix = `s${(sequence = (sequence + 1) % 1000)}`;
  return (el: HTMLElement) => {
    const ref = `${prefix}c${(n += 1)}`;
    generation.set(ref, new WeakRef(el));
    return ref;
  };
}

/**
 * The element behind a reference, or null — gone from the table, collected,
 * or no longer in the document. "No longer the same node" and "not found"
 * are deliberately the same answer: both mean do not act.
 */
export function resolveRef(ref: string): HTMLElement | null {
  for (const generation of generations) {
    const el = generation.get(ref)?.deref();
    if (el && el.isConnected) return el;
  }
  return null;
}

/** Test seam: forget every reading. */
export function resetRefsForTest(): void {
  generations.length = 0;
  sequence = 0;
}
