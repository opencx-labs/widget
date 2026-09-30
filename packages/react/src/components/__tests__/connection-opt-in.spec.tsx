import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ElicitationForm } from '../ElicitationForm';
import { ConnectionsSettings } from '../ConnectionsSettings';

const fixture = vi.hoisted(() => ({
  config: { capabilities: { connections: undefined as boolean | undefined } },
  api: {
    listElicitations: vi.fn(),
    listConnections: vi.fn(),
    listApprovalPreferences: vi.fn(),
  },
}));
vi.mock('@opencx/widget-react-headless', () => {
  const context = { config: fixture.config, widgetCtx: { api: fixture.api } };
  return { useWidget: () => context };
});
vi.mock('../Header', () => ({ Header: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  fixture.config.capabilities.connections = undefined;
  Object.values(fixture.api).forEach((fn) => fn.mockResolvedValue([]));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.useRealTimers();
});
const render = () =>
  act(async () =>
    root.render(
      <>
        <ConnectionsSettings>
          <p>Sessions</p>
        </ConnectionsSettings>
        <ElicitationForm sessionId="existing-v4-session" active />
      </>,
    ),
  );

it('makes no connection requests for an unchanged v4 configuration', async () => {
  await render();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  Object.values(fixture.api).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  expect(container.textContent?.trim()).toBe('Sessions');
});

it('starts after opt-in and stops polling when connections are disabled', async () => {
  fixture.config.capabilities.connections = true;
  await render();
  expect(fixture.api.listConnections).toHaveBeenCalledOnce();
  expect(fixture.api.listApprovalPreferences).toHaveBeenCalledOnce();
  expect(fixture.api.listElicitations).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(fixture.api.listElicitations).toHaveBeenCalledTimes(2);
  fixture.config.capabilities.connections = false;
  await render();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(fixture.api.listElicitations).toHaveBeenCalledTimes(2);
});
