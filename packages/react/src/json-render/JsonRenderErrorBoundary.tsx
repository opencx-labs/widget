import React from 'react';
import { log } from '@opencx/widget-core';

/**
 * Last-resort guard around a rendered spec. json-render validates props at the
 * registry boundary (`parseProps`), but a genuinely broken tree (e.g. a cyclic
 * `children` ref) could still throw during render — this keeps that from taking
 * down the whole chat transcript. On error we render nothing (the prose in the
 * same message still shows) and log once for diagnosis.
 */
export class JsonRenderErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey: unknown },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    log.error('json-render: spec failed to render', {
      _e: error instanceof Error ? error.message : String(error),
    });
  }

  override componentDidUpdate(prevProps: Readonly<{ resetKey: unknown }>) {
    // Streaming specs are partial by definition. A broken intermediate tree
    // may become valid after the next patch, so retry only when the caller
    // supplies a new spec revision. Healthy renders never take this state path.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
