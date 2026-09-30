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
  sameContext: () => boolean;
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

// Mutation callbacks advance shared counters, never scan retained references.
// Entries hold counters rather than nodes, so detached host trees stay collectible.
type Revision = { value: number };
let subtreeRevisions = new WeakMap<Node, Revision>();
let recordRevisions = new WeakMap<Node, Revision>();
let lineageRevisions = new WeakMap<Node, Revision>();

// Keep record identity local. A top-level button has no containing record;
// treating the document body as one makes a clock anywhere cancel its click.
const CONTEXT_SELECTOR =
  'tr,li,article,form,fieldset,section,dialog,aside,nav,main,header,footer,[role="row"],[role="listitem"],[role="group"],[role="region"],[role="dialog"],[role="tooltip"]';
const RECORD_SELECTOR = 'tr,li,article,[role="row"],[role="listitem"]';
const GROUP_SELECTOR =
  'section,form,fieldset,dialog,[role="group"],[role="region"],[role="dialog"]';
const PRESENTATION_ATTRIBUTES = new Set(['class', 'style', 'aria-busy']);

function contextRoot(element: HTMLElement): Element {
  const record = element.closest(RECORD_SELECTOR);
  if (record) return record;
  // A layout wrapper around the button does not detach it from its outer
  // item label. Without an explicit record, conservatively bind the enclosing
  // group, including nested groups in either direction. Never fall back to body.
  let group = element.closest(GROUP_SELECTOR);
  if (group) {
    let outer = group.parentElement?.closest(GROUP_SELECTOR);
    while (outer) {
      group = outer;
      outer = group.parentElement?.closest(GROUP_SELECTOR);
    }
    return group;
  }
  const region = element.closest(CONTEXT_SELECTOR);
  if (region) return region;
  const parent = element.parentElement;
  return parent &&
    parent !== element.ownerDocument.body &&
    parent !== element.ownerDocument.documentElement
    ? parent
    : element;
}

function transient(node: Element): boolean {
  return isWidgetOwned(node) || node.closest('[role="tooltip"]') !== null;
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
      changed.every((node) => node.nodeType === 1 && transient(node as Element))
    )
      return false;
  }
  return true;
}

function advance(records: MutationRecord[]) {
  const changed = new Set<Revision>();
  for (const record of records) {
    // Removal/reparenting must invalidate even if the node is now inside an
    // ignored tooltip or the widget. Every observed control tracks its lineage.
    for (const node of Array.from(record.removedNodes)) {
      const revision = lineageRevisions.get(node);
      if (revision) changed.add(revision);
    }
    if (!recordIsRelevant(record)) continue;
    if (record.type === 'attributes') {
      const revision = lineageRevisions.get(record.target);
      if (revision) changed.add(revision);
    }
    let withinRecord = true;
    for (let node: Node | null = record.target; node; node = node.parentNode) {
      const subtree = subtreeRevisions.get(node);
      if (subtree) changed.add(subtree);
      if (withinRecord) {
        const ownContent = recordRevisions.get(node);
        if (ownContent) changed.add(ownContent);
      }
      if (!(node instanceof Element)) continue;
      // A control's own scope includes nested groups: their label may identify
      // its action. Only ancestor-record identity excludes sibling child items.
      if (node.matches(RECORD_SELECTOR)) withinRecord = false;
      // Transient tooltip content is not the enclosing record's identity.
      // Changing an existing node's role is itself a semantic change.
      if (
        node.matches('[role="tooltip"]') &&
        !(record.type === 'attributes' && record.attributeName === 'role')
      )
        break;
    }
  }
  changed.forEach((revision) => revision.value++);
}

function captureContext(element: HTMLElement): () => boolean {
  const captured: { revision: Revision; value: number }[] = [];
  const track = (node: Node, revisions: WeakMap<Node, Revision>) => {
    let revision = revisions.get(node);
    if (!revision) {
      revision = { value: 0 };
      revisions.set(node, revision);
    }
    captured.push({ revision, value: revision.value });
  };
  const root = contextRoot(element);
  track(root, subtreeRevisions);
  // Bind the complete local scope. Ancestor records contribute their own
  // identity, excluding sibling records. This preserves nested Order/Item
  // ownership without treating another item's updates as this item's identity.
  for (let node: Node | null = element; node; node = node.parentNode) {
    track(node, lineageRevisions);
    if (
      node !== root &&
      node instanceof Element &&
      node.matches(RECORD_SELECTOR)
    )
      track(node, recordRevisions);
  }
  return () =>
    captured.every(({ revision, value }) => revision.value === value);
}

function flushMutations() {
  if (observer) advance(observer.takeRecords());
}

function observe(doc: Document) {
  if (observedDocument === doc) return;
  observer?.disconnect();
  // References from another document cannot authorize actions here.
  for (const generation of generations)
    for (const entry of Array.from(generation.values())) entry.valid = false;
  observedDocument = doc;
  subtreeRevisions = new WeakMap();
  recordRevisions = new WeakMap();
  lineageRevisions = new WeakMap();
  observer = new MutationObserver(advance);
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
    entry.sameContext() &&
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
            sameContext: captureContext(el),
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
  subtreeRevisions = new WeakMap();
  recordRevisions = new WeakMap();
  lineageRevisions = new WeakMap();
}
