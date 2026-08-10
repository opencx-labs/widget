import { getByPath, type Spec, type UIElement } from '@json-render/core';

/**
 * Recover List rows the model parked behind a `repeat`.
 *
 * The prompt documents a generic `repeat` directive (bind a container's children
 * to a `/state` array). The model sometimes copies that pattern onto a `List` —
 * a leaf that renders `props.items` and ignores `children` — producing
 * `{ type: 'List', props: { items: [] }, repeat: { statePath } }` with the real
 * rows sitting in `state`. That renders an invisible empty list.
 *
 * This detects a `List` with empty `items` + a `repeat`, resolves the state
 * array, inlines it into `props.items`, and drops the `repeat`. Scoped to `List`
 * on purpose: List items are 1:1 with state objects (lossless to inline). Table
 * rows are positional `string[]` (can't inline) and an empty Table already shows
 * a visible empty state, so it's not a silent failure there.
 *
 * Returns the SAME spec reference when nothing changed, to keep React identity
 * stable across streaming re-renders.
 */
export function inlineRepeatLeaves(spec: Spec): Spec {
  if (!spec.elements) return spec;

  let changed = false;
  const elements: Record<string, UIElement> = {};

  for (const [id, element] of Object.entries(spec.elements)) {
    const recovered = recoverListRepeat(element, spec);
    if (recovered !== element) changed = true;
    elements[id] = recovered;
  }

  return changed ? { ...spec, elements } : spec;
}

function recoverListRepeat(element: UIElement, spec: Spec): UIElement {
  if (element.type !== 'List') return element;

  const repeat = element.repeat;
  if (!repeat || typeof repeat.statePath !== 'string') return element;

  const props = isRecord(element.props) ? element.props : {};
  const items = props.items;
  const alreadyHasItems = Array.isArray(items) && items.length > 0;
  if (alreadyHasItems) return element;

  const resolved = getByPath(spec.state ?? {}, repeat.statePath);
  if (!Array.isArray(resolved) || resolved.length === 0) return element;

  const { repeat: _dropped, ...rest } = element;
  return { ...rest, props: { ...props, items: resolved } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
