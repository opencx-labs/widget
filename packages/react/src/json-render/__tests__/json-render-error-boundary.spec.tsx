import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { JsonRenderErrorBoundary } from '../JsonRenderErrorBoundary';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function PartialSpec({ throws }: { throws: boolean }) {
  if (throws) throw new Error('partial streamed spec');
  return <div>Valid streamed spec</div>;
}

it('recovers from a throwing partial tree when the spec revision changes', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const partialRevision = {};
  const validRevision = {};

  try {
    act(() => {
      root.render(
        <JsonRenderErrorBoundary resetKey={partialRevision}>
          <PartialSpec throws />
        </JsonRenderErrorBoundary>,
      );
    });
    expect(container.textContent).toBe('');

    // A child rerender alone must not retry the same broken revision forever.
    act(() => {
      root.render(
        <JsonRenderErrorBoundary resetKey={partialRevision}>
          <PartialSpec throws={false} />
        </JsonRenderErrorBoundary>,
      );
    });
    expect(container.textContent).toBe('');

    act(() => {
      root.render(
        <JsonRenderErrorBoundary resetKey={validRevision}>
          <PartialSpec throws={false} />
        </JsonRenderErrorBoundary>,
      );
    });
    expect(container.textContent).toBe('Valid streamed spec');
  } finally {
    act(() => root.unmount());
    consoleError.mockRestore();
  }
});
