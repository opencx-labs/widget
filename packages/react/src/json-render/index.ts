/**
 * Widget json-render module — renders the agent chat stream's composable UI
 * (list / table / chart / metric) from json-render `data-spec` parts. Built on
 * bundled `@json-render/core` + `@json-render/react` implementations pinned at
 * 0.19.0. They stay behind this module instead of becoming peer requirements
 * for widget consumers.
 *
 * This barrel is the module's render seam:
 * - `SpecRenderer` — the in-widget render seam (streaming + history).
 * - `HostedSpecRenderer` + `segmentContent` — the same renderer and the same
 *   fence parser for a host page that shows widget transcripts (the OpenCX
 *   inbox), so there is one catalog and one implementation of every card.
 * - `buildSpec` — assemble a spec from a message's `data-spec` parts.
 *
 * The catalog, registry, and normalizer stay internal; in-module consumers
 * import those files directly.
 */
import { type Spec } from '@json-render/core';
import { buildSpecFromParts, type DataPart } from '@json-render/react';

export { HostedSpecRenderer, SpecRenderer } from './SpecRenderer';
export { segmentContent, type ContentSegment } from './segment-content';

/**
 * Assemble the accumulated element-tree spec from a message's `data-spec` parts
 * (the json-render patches `pipeJsonRender` emitted server-side). Returns `null`
 * when the message carries no spec parts. Thin wrapper over `buildSpecFromParts`
 * so the stream-mapping layer depends on this module, not the library directly.
 */
export function buildSpec(parts: DataPart[]): Spec | null {
  return buildSpecFromParts(parts);
}
