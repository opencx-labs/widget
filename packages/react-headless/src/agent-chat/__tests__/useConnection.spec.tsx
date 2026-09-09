import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useConnection } from '../useConnection';

const fixture = vi.hoisted(() => ({
  widgetCtx: {
    api: {
      startConnection: vi.fn(),
      listConnections: vi.fn(),
      disconnectConnection: vi.fn(),
    },
  },
  config: { user: { token: 'account-a' } },
}));
vi.mock('../../WidgetProvider', () => ({ useWidget: () => fixture }));
const request = {
  server_id: 'a1111111-1111-4111-8111-111111111111',
  request_id: 'b1111111-1111-4111-8111-111111111111',
};
const tab = { closed: false, close: vi.fn(), navigate: vi.fn() };
let opener: unknown;
// Window-typed test double; only popup operations are intercepted.
const popup = new Proxy(window, {
  get(target, key) {
    if (key === 'closed') return tab.closed;
    if (key === 'close') return tab.close;
    if (key === 'location') return { replace: tab.navigate };
    if (key === 'opener') return opener;
    return Reflect.get(target, key);
  },
  set(_target, key, value: unknown) {
    if (key !== 'opener')
      throw new Error(`Unexpected popup mutation: ${String(key)}`);
    opener = value;
    return true;
  },
});
let root: Root;
let container: HTMLDivElement;
let current: ReturnType<typeof useConnection> | undefined;
function Harness() {
  current = useConnection(request);
  return null;
}
function renderHook() {
  const rerender = () => act(() => root.render(<Harness />));
  rerender();
  return {
    result: {
      get current() {
        if (!current) throw new Error('Hook not mounted');
        return current;
      },
    },
    rerender,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  fixture.config.user.token = 'account-a';
  fixture.widgetCtx.api.startConnection.mockResolvedValue({
    authorization_url: 'https://accounts.example/authorize',
    completion: 'oauth',
  });
  fixture.widgetCtx.api.listConnections.mockResolvedValue([]);
  tab.closed = false;
  opener = window;
  vi.spyOn(window, 'open').mockReturnValue(popup);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });

it('opens on the first click, isolates the popup and waits for verified backend status', async () => {
  const { result } = renderHook();
  expect(window.open).not.toHaveBeenCalled();
  expect(fixture.widgetCtx.api.startConnection).not.toHaveBeenCalled();
  fixture.widgetCtx.api.startConnection.mockImplementation(async () => {
    expect(window.open).toHaveBeenCalledOnce();
    expect(opener).toBeNull();
    return {
      authorization_url: 'https://accounts.example/authorize',
      completion: 'oauth',
    };
  });
  await act(() => result.current.start());
  expect(tab.navigate).toHaveBeenCalledWith(
    'https://accounts.example/authorize',
  );
  expect(result.current.phase).toBe('waiting');
  fixture.widgetCtx.api.listConnections.mockResolvedValue([
    { server_id: request.server_id, status: 'connected' },
  ]);
  await tick();
  expect(result.current.phase).toBe('connected');
  expect(tab.close).toHaveBeenCalledOnce();
});

it('rechecks external access on popup close without trusting gateway status', async () => {
  fixture.widgetCtx.api.startConnection.mockResolvedValue({
    authorization_url: 'https://mollie.example/connect',
    completion: 'external',
  });
  const { result } = renderHook();
  await act(() => result.current.start());
  expect(result.current.phase).toBe('waiting');
  await tick();
  expect(result.current.phase).toBe('waiting');
  tab.closed = true;
  await tick();
  expect(result.current.phase).toBe('external');
  expect(fixture.widgetCtx.api.listConnections).not.toHaveBeenCalled();
});

it('rechecks a customer-managed connection when the user returns from its page', async () => {
  fixture.widgetCtx.api.startConnection.mockResolvedValue({
    authorization_url: 'https://mollie.example/connect',
    completion: 'external',
  });
  const { result } = renderHook();
  await act(() => result.current.start());
  act(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await tick();
  expect(result.current.phase).toBe('external');
  expect(fixture.widgetCtx.api.listConnections).not.toHaveBeenCalled();
});

it('detects returning from a popup that took focus before the API finished', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  fixture.widgetCtx.api.startConnection.mockImplementation(async () => {
    window.dispatchEvent(new Event('blur'));
    return {
      authorization_url: 'https://mollie.example/connect',
      completion: 'external',
    };
  });
  const { result } = renderHook();
  await act(() => result.current.start());
  expect(result.current.phase).toBe('waiting');
  expect(tab.closed).toBe(false);
  act(() => window.dispatchEvent(new Event('focus')));
  await tick();
  expect(result.current.phase).toBe('external');
  expect(fixture.widgetCtx.api.listConnections).not.toHaveBeenCalled();
});

it('offers the same authorization URL if the browser blocks the popup', async () => {
  vi.mocked(window.open).mockReturnValue(null);
  const { result } = renderHook();
  await act(() => result.current.start());
  expect(result.current.phase).toBe('ready');
  expect(result.current.authorization?.host).toBe('accounts.example');
  fixture.widgetCtx.api.listConnections.mockResolvedValue([
    { server_id: request.server_id, status: 'connected' },
  ]);
  await act(async () => result.current.opened());
  expect(result.current.phase).toBe('connected');
  expect(fixture.widgetCtx.api.startConnection).toHaveBeenCalledOnce();
});

it('allows retry after a cancelled authorization without claiming success', async () => {
  const { result } = renderHook();
  await act(() => result.current.start());
  tab.closed = true;
  await tick();
  expect(result.current.phase).toBe('idle');
  tab.closed = false;
  await act(() => result.current.start());
  expect(result.current.phase).toBe('waiting');
});

it('drops an old account response and closes its blank popup on identity change', async () => {
  let finish: (value: {
    authorization_url: string;
    completion: string;
  }) => void = () => {};
  fixture.widgetCtx.api.startConnection.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook();
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = result.current.start();
  });
  fixture.config.user.token = 'account-b';
  rerender();
  await act(async () => {
    finish({
      authorization_url: 'https://account-a.example/connect',
      completion: 'oauth',
    });
    await pending;
  });
  expect(tab.close).toHaveBeenCalledOnce();
  expect(tab.navigate).not.toHaveBeenCalled();
  expect(result.current.authorization).toBeNull();
  expect(result.current.phase).toBe('idle');
});

it('rejects unsafe URLs and closes failed sign-in windows', async () => {
  fixture.widgetCtx.api.startConnection.mockResolvedValue({
    authorization_url: 'javascript:alert(1)',
    completion: 'oauth',
  });
  const { result } = renderHook();
  await act(() => result.current.start());
  expect(result.current.authorization).toBeNull();
  expect(result.current.error).toBeTruthy();
  expect(tab.navigate).not.toHaveBeenCalled();
  expect(tab.close).toHaveBeenCalledOnce();
  fixture.widgetCtx.api.startConnection.mockRejectedValue(
    new Error('Request expired'),
  );
  await act(() => result.current.start());
  expect(result.current.error).toBe('Request expired');
  expect(result.current.phase).toBe('idle');
});

it('reports polling failures and expires unfinished authorization', async () => {
  const { result } = renderHook();
  fixture.widgetCtx.api.listConnections.mockRejectedValueOnce(
    new Error('Connection unavailable'),
  );
  await act(() => result.current.start());
  expect(result.current.error).toBe('Connection unavailable');
  expect(result.current.phase).toBe('idle');
  await act(() => result.current.start());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600_000);
  });
  expect(result.current.error).toBe('Connection timed out. Try again.');
  expect(result.current.phase).toBe('idle');
});
