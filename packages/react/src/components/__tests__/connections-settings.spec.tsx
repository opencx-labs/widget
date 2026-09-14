import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../Header', () => ({ Header: () => null }));
import { ConnectionsSettings } from '../ConnectionsSettings';
const api = vi.hoisted(() => ({
  listConnections: vi.fn(),
  listApprovalPreferences: vi.fn(),
  disconnectConnection: vi.fn(),
  revokeApprovalPreference: vi.fn(),
}));
vi.mock('@opencx/widget-react-headless', () => {
  const context = { widgetCtx: { api }, config: {} };
  return { useWidget: () => context };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  api.listConnections.mockResolvedValue([]);
  api.listApprovalPreferences.mockResolvedValue([]);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});
const render = async () => {
  await act(async () =>
    root.render(
      <ConnectionsSettings>
        <p>Session list</p>
      </ConnectionsSettings>,
    ),
  );
};
it('hides settings for services the user has never connected', async () => {
  api.listConnections.mockResolvedValue([
    {
      server_id: 'unconnected',
      name: 'Unconnected service',
      status: 'not_connected',
    },
  ]);
  await render();
  expect(container.textContent).toBe('Session list');
});
it('places personal connection settings behind navigation and disconnects the selected service', async () => {
  api.listConnections.mockResolvedValue([
    { server_id: 'mine', name: 'My service', status: 'connected' },
    { server_id: 'other', name: 'Other service', status: 'not_connected' },
  ]);
  api.disconnectConnection.mockResolvedValue(undefined);
  await render();
  expect(container.textContent).not.toContain('My service');
  await act(async () => container.querySelector('button')?.click());
  expect(container.textContent).toContain('My service');
  expect(container.textContent).not.toContain('Other service');
  await act(async () =>
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('My service'))
      ?.click(),
  );
  await act(async () =>
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Disconnect')
      ?.click(),
  );
  expect(api.disconnectConnection).toHaveBeenCalledWith('mine');
  expect(container.textContent).toContain('No connected services');
});

it('lists multiple approvals and removes only the selected approval', async () => {
  api.listConnections.mockResolvedValue([
    { server_id: 'mine', name: 'My service', status: 'connected' },
  ]);
  api.listApprovalPreferences.mockResolvedValue([
    {
      serverId: 'mine',
      key: 'a',
      toolName: 'refund',
      message: 'Approve refund?',
    },
    {
      serverId: 'mine',
      key: 'b',
      toolName: 'export',
      message: 'Approve export?',
    },
  ]);
  api.revokeApprovalPreference.mockResolvedValue(undefined);
  await render();
  await act(async () => container.querySelector('button')?.click());
  await act(async () =>
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('My service'))
      ?.click(),
  );
  const list = container.querySelector('ul');
  expect(list?.querySelectorAll('li')).toHaveLength(2);
  await act(async () => list?.querySelector('button')?.click());
  expect(api.revokeApprovalPreference).toHaveBeenCalledWith('mine', 'a');
  expect(list?.textContent).not.toContain('Approve refund?');
  expect(list?.textContent).toContain('Approve export?');
  expect(api.disconnectConnection).not.toHaveBeenCalled();
});
