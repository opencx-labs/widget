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

/** Keep two readings. Controls present in each new reading renew their handles;
 * absent controls expire without ever assigning their handles to another node. */
const GENERATIONS_KEPT = 2;

type Generation = Map<string, WeakRef<HTMLElement>>;

const generations: Generation[] = [];
let sequence = 0;
let elementRefs = new WeakMap<HTMLElement, string>();

/** Open a new reading. Returns the mint function for its references. */
export function beginSnapshot(): (el: HTMLElement) => string {
  const generation: Generation = new Map();
  generations.unshift(generation);
  generations.length = Math.min(generations.length, GENERATIONS_KEPT);
  let n = 0;
  // References must never alias a newer control during a long-lived SPA visit.
  const prefix = `s${++sequence}`;
  return (el: HTMLElement) => {
    const previous = elementRefs.get(el);
    // Renew a live handle for a control included in consecutive readings.
    // Expired handles are never resurrected, and replacement nodes get new IDs.
    const ref =
      previous && generations.some((reading) => reading.has(previous))
        ? previous
        : `${prefix}c${(n += 1)}`;
    generation.set(ref, new WeakRef(el));
    elementRefs.set(el, ref);
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
  elementRefs = new WeakMap();
}
