import { isNonEmptySpec, type Spec } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import type { WidgetUiAction } from '@opencx/widget-core';
import { useConfig } from '@opencx/widget-react-headless';
import React, { useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import {
  JsonRenderHostProvider,
  useHostFromProps,
  type JsonRenderHost,
} from './host';
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
 * THIS spec's own state) wrapped in an error boundary.
 */
export function SpecRenderer({ spec }: { spec: Spec | null }) {
  const { anchorTarget, onUiAction } = useConfig();
  const { t } = useTranslation();
  const host = useMemo<JsonRenderHost>(
    () => ({ t, anchorTarget: anchorTarget ?? '_blank', onUiAction }),
    [t, anchorTarget, onUiAction],
  );
  return <HostedSpec spec={spec} host={host} />;
}

/**
 * The same renderer for a page that is not the widget but shows what the
 * widget showed — the OpenCX inbox. The host supplies what the widget would
 * have read from its config; nothing else about rendering differs, so a
 * customer and the agent reading their session see one and the same card.
 */
export function HostedSpecRenderer({
  spec,
  language,
  onUiAction,
  anchorTarget,
}: {
  spec: Spec | null;
  language?: string;
  onUiAction?: (action: WidgetUiAction) => void;
  anchorTarget?: string;
}) {
  const host = useHostFromProps({ language, onUiAction, anchorTarget });
  return <HostedSpec spec={spec} host={host} />;
}

function HostedSpec({
  spec,
  host,
}: {
  spec: Spec | null;
  host: JsonRenderHost;
}) {
  const normalized = useMemo(
    () => (spec ? inlineRepeatLeaves(spec) : null),
    [spec],
  );

  // Nothing to show until the spec has at least a root + one element. Guards the
  // gap between "spec object exists" and "first patch applied" during streaming.
  if (!normalized || !isNonEmptySpec(normalized)) return null;

  return (
    <JsonRenderHostProvider host={host}>
      <JsonRenderErrorBoundary resetKey={normalized}>
        <JSONUIProvider registry={registry} initialState={normalized.state}>
          <Renderer
            spec={normalized}
            registry={registry}
            fallback={JsonRenderFallback}
          />
        </JSONUIProvider>
      </JsonRenderErrorBoundary>
    </JsonRenderHostProvider>
  );
}
