/**
 * Widget json-render module — renders the agent-v3 stream's composable UI
 * (list / table / chart / insight) from json-render `data-spec` parts. Built on
 * `@json-render/core` + `@json-render/react` pinned at 0.19.0.
 *
 * This barrel is the module's render seam, nothing more — the two things the
 * rest of the widget needs to turn spec parts into UI:
 * - `SpecRenderer` — the render seam (streaming + history both go through it).
 * - `buildSpec` — assemble a spec from a message's `data-spec` parts.
 *
 * Everything else (catalog, registry, spec normalization, content
 * segmentation) is internal to this module; the few in-module consumers
 * import those files directly.
 */
import { type Spec } from '@json-render/core';
import { buildSpecFromParts, type DataPart } from '@json-render/react';

export { SpecRenderer } from './SpecRenderer';

/**
 * Assemble the accumulated element-tree spec from a message's `data-spec` parts
 * (the json-render patches `pipeJsonRender` emitted server-side). Returns `null`
 * when the message carries no spec parts. Thin wrapper over `buildSpecFromParts`
 * so the stream-mapping layer depends on this module, not the library directly.
 */
export function buildSpec(parts: DataPart[]): Spec | null {
  return buildSpecFromParts(parts);
}
