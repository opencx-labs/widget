import { isNonEmptySpec, type Spec } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import React, { useMemo } from 'react';
import { JsonRenderErrorBoundary } from './JsonRenderErrorBoundary';
import { inlineRepeatLeaves } from './normalize-spec';
import { JsonRenderFallback, registry } from './registry';

/**
 * The single seam every json-render spec funnels through — both the live
 * streamed turn and persisted (fence-parsed) history go through here, so both
 * get the same recovery + defenses.
 *
 * Applies leaf-`repeat` recovery, guards empty/partial specs, and renders under
 * a per-spec state provider (so `{ "$state": "/path" }` refs resolve against
 * THIS spec's own state) wrapped in an error boundary. `loading` flows to the
 * registry components for shimmer states while the spec streams.
 */
export function SpecRenderer({ spec, loading }: { spec: Spec | null; loading?: boolean }) {
  const normalized = useMemo(() => (spec ? inlineRepeatLeaves(spec) : null), [spec]);

  // Nothing to show until the spec has at least a root + one element. Guards the
  // gap between "spec object exists" and "first patch applied" during streaming.
  if (!normalized || !isNonEmptySpec(normalized)) return null;

  return (
    <JsonRenderErrorBoundary>
      <JSONUIProvider registry={registry} initialState={normalized.state}>
        <Renderer
          spec={normalized}
          registry={registry}
          loading={loading}
          fallback={JsonRenderFallback}
        />
      </JSONUIProvider>
    </JsonRenderErrorBoundary>
  );
}
