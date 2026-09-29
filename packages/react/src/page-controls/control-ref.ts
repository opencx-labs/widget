import { isWidgetOwned } from '../page-marks/page-element';
import { accessibleName } from './accessible-name';
import { captureActionMeaning } from './action-meaning';

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

type ControlReference = {
  element: WeakRef<HTMLElement>;
  context: WeakRef<Element>;
  name: string;
  url: string;
  sameMeaning: () => boolean;
  valid: boolean;
};
type Generation = Map<string, ControlReference>;

const generations: Generation[] = [];
let sequence = 0;
let elementRefs = new WeakMap<HTMLElement, string>();
let observer: MutationObserver | undefined;
let observedDocument: Document | undefined;

// Use explicit record boundaries when present. Without one, any host content
// change may repurpose a generic button, so conservatively use the whole body.
const CONTEXT_SELECTOR =
  'tr,li,article,form,fieldset,section,dialog,[role="row"],[role="listitem"],[role="group"],[role="region"],[role="dialog"]';
const RECORD_SELECTOR = 'tr,li,article,[role="row"],[role="listitem"]';
const PRESENTATION_ATTRIBUTES = new Set(['class', 'style', 'aria-busy']);

function contextFor(element: HTMLElement): Element {
  // A section or form inside a recycled row is still about that row. Include
  // outer records too: a nested line item can belong to a different order.
  let record = element.closest(RECORD_SELECTOR);
  if (record) {
    let parent = record.parentElement?.closest(RECORD_SELECTOR);
    while (parent) {
      record = parent;
      parent = record.parentElement?.closest(RECORD_SELECTOR);
    }
    return record;
  }
  return (
    element.closest(CONTEXT_SELECTOR) ?? element.ownerDocument.body ?? element
  );
}

function recordIsRelevant(record: MutationRecord): boolean {
  const node =
    record.target.nodeType === 1
      ? (record.target as Element)
      : record.target.parentElement;
  if (node && isWidgetOwned(node)) return false;
  if (
    record.type === 'attributes' &&
    PRESENTATION_ATTRIBUTES.has(record.attributeName ?? '')
  )
    return false;
  if (record.type === 'childList') {
    const changed = [
      ...Array.from(record.addedNodes),
      ...Array.from(record.removedNodes),
    ];
    if (
      changed.length &&
      changed.every(
        (node) => node.nodeType === 1 && isWidgetOwned(node as Element),
      )
    )
      return false;
  }
  return true;
}

function invalidate(records: MutationRecord[]) {
  const relevant = records.filter(recordIsRelevant);
  if (!relevant.length) return;
  const entries = new Set(
    generations.flatMap((generation) => Array.from(generation.values())),
  );
  for (const entry of Array.from(entries)) {
    if (!entry.valid) continue;
    const element = entry.element.deref();
    const context = entry.context.deref();
    if (
      !element ||
      !context ||
      relevant.some(
        (record) =>
          context.contains(record.target) ||
          (record.type === 'attributes' && record.target.contains(element)) ||
          (record.type === 'childList' &&
            Array.from(record.removedNodes).some((node) =>
              node.contains(element),
            )),
      )
    )
      entry.valid = false;
  }
}

function flushMutations() {
  if (observer) invalidate(observer.takeRecords());
}

function observe(doc: Document) {
  if (observedDocument === doc) return;
  observer?.disconnect();
  // References from another document cannot authorize actions here.
  for (const generation of generations)
    for (const entry of Array.from(generation.values())) entry.valid = false;
  observedDocument = doc;
  observer = new MutationObserver(invalidate);
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
}

function current(
  entry: ControlReference,
  element: HTMLElement,
  name = accessibleName(element),
) {
  entry.valid &&=
    element.isConnected &&
    entry.url === element.ownerDocument.location.href &&
    entry.name === name &&
    entry.sameMeaning();
  return entry.valid;
}

/** Open a new reading. Returns the mint function for its references. */
export function beginSnapshot(): (el: HTMLElement, name?: string) => string {
  flushMutations();
  const generation: Generation = new Map();
  generations.unshift(generation);
  generations.length = Math.min(generations.length, GENERATIONS_KEPT);
  let n = 0;
  // References must never alias a newer control during a long-lived SPA visit.
  const prefix = `s${++sequence}`;
  return (el: HTMLElement, name = accessibleName(el)) => {
    observe(el.ownerDocument);
    flushMutations();
    const previous = elementRefs.get(el);
    const prior = previous
      ? generations
          .map((reading) => reading.get(previous))
          .find((entry) => entry !== undefined)
      : undefined;
    // Renew a live handle for a control included in consecutive readings.
    // Expired handles are never resurrected, and replacement nodes get new IDs.
    const ref =
      previous && prior && current(prior, el, name)
        ? previous
        : `${prefix}c${(n += 1)}`;
    const entry =
      ref === previous && prior
        ? prior
        : {
            element: new WeakRef(el),
            context: new WeakRef(contextFor(el)),
            name,
            url: el.ownerDocument.location.href,
            sameMeaning: captureActionMeaning(el),
            valid: true,
          };
    generation.set(ref, entry);
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
  const entry = inspectRef(ref);
  return entry?.isCurrent ? entry.element : null;
}

/** Guard-only inspection: a stale element must never be authorized to act.
 * Keeping its identity status separate lets the guard report a more specific
 * privacy/visibility refusal before returning "gone" for a changed operation. */
export function inspectRef(
  ref: string,
): { element: HTMLElement; isCurrent: boolean } | null {
  flushMutations();
  for (const generation of generations) {
    const entry = generation.get(ref);
    if (!entry) continue;
    const el = entry.element.deref();
    if (el && el.isConnected)
      return { element: el, isCurrent: current(entry, el) };
  }
  return null;
}

/** Test seam: forget every reading. */
export function resetRefsForTest(): void {
  generations.length = 0;
  sequence = 0;
  elementRefs = new WeakMap();
  observer?.disconnect();
  observer = undefined;
  observedDocument = undefined;
}
