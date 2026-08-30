import { WidgetCtx } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetProvider } from '../WidgetProvider';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('WidgetProvider initialization', () => {
  afterEach(() => vi.restoreAllMocks());

  it('leaves loading and renders the configured error surface on failure', async () => {
    const error = new Error('agent unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(WidgetCtx, 'initialize').mockRejectedValue(error);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WidgetProvider
          options={{ token: 'token' }}
          components={[{ key: 'fallback', component: () => null }]}
          loadingComponent={<div>loading</div>}
          errorComponent={(failure) => (
            <div role="alert">{failure.message}</div>
          )}
        >
          <div>ready</div>
        </WidgetProvider>,
      );
    });

    await vi.waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        'agent unavailable',
      ),
    );
    expect(container.textContent).not.toContain('loading');

    act(() => root.unmount());
    container.remove();
  });
});
