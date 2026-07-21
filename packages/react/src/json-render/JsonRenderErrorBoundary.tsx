import React from 'react';

/**
 * Last-resort guard around a rendered spec. json-render validates props at the
 * registry boundary (`parseProps`), but a genuinely broken tree (e.g. a cyclic
 * `children` ref) could still throw during render — this keeps that from taking
 * down the whole chat transcript. On error we render nothing (the prose in the
 * same message still shows) and log once for diagnosis.
 */
export class JsonRenderErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('json-render: spec failed to render', {
      _e: error instanceof Error ? error.message : String(error),
    });
  }

  override render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
