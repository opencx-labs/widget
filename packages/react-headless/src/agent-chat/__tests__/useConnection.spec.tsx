import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ConnectionRequestExpiredError,
  type SendMessageInput,
  type WidgetCtx,
} from '@opencx/widget-core';
import { ConnectionAttemptProvider, useConnection } from '../useConnection';

const fixture = vi.hoisted(() => ({
  widgetCtx: {
    api: {
      startConnection: vi.fn(),
      getConnectionAttempt: vi.fn(),
      disconnectConnection: vi.fn(),
    },
    messageCtx: { sendMessage: vi.fn() },
  },
}));
const request = {
  server_id: 'a1111111-1111-4111-8111-111111111111',
  request_id: 'b1111111-1111-4111-8111-111111111111',
  name: 'Bookkeeping',
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
const onHandled = vi.fn();
function Probe({ activeRequest }: { activeRequest: typeof request }) {
  current = useConnection(activeRequest);
  return null;
}
function Harness({
  show = true,
  activeRequest = request,
}: {
  show?: boolean;
  activeRequest?: typeof request;
}) {
  return (
    <ConnectionAttemptProvider
      request={activeRequest}
      widgetCtx={fixture.widgetCtx as unknown as WidgetCtx}
      onHandled={onHandled}
    >
      {show && <Probe activeRequest={activeRequest} />}
    </ConnectionAttemptProvider>
  );
}
function renderHook() {
  const rerender = (
    show = true,
    identity = 'account-a',
    activeRequest = request,
  ) =>
    act(() =>
      root.render(
        <Harness key={identity} show={show} activeRequest={activeRequest} />,
      ),
    );
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
  fixture.widgetCtx.api.startConnection.mockResolvedValue({
    authorization_url: 'https://accounts.example/authorize',
    completion: 'oauth',
    attempt_id: 'attempt-1',
  });
  fixture.widgetCtx.api.getConnectionAttempt.mockResolvedValue('pending');
  fixture.widgetCtx.messageCtx.sendMessage.mockImplementation(
    async (input: SendMessageInput) => input.onAccepted?.(),
  );
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
  const { result, rerender } = renderHook();
  expect(window.open).not.toHaveBeenCalled();
  expect(fixture.widgetCtx.api.startConnection).not.toHaveBeenCalled();
  fixture.widgetCtx.api.startConnection.mockImplementation(async () => {
    expect(window.open).toHaveBeenCalledOnce();
    expect(opener).toBeNull();
    return {
      authorization_url: 'https://accounts.example/authorize',
      completion: 'oauth',
      attempt_id: 'attempt-1',
    };
  });
  await act(() => result.current.start());
  expect(tab.navigate).toHaveBeenCalledWith(
    'https://accounts.example/authorize',
  );
  expect(result.current.phase).toBe('waiting');
  fixture.widgetCtx.api.getConnectionAttempt.mockResolvedValue('connected');
  await tick();
  expect(result.current.phase).toBe('connected');
  expect(tab.close).toHaveBeenCalledOnce();
  expect(fixture.widgetCtx.messageCtx.sendMessage).toHaveBeenCalledWith({
    background: true,
    connectionRequestId: request.request_id,
    content:
      'The connection to Bookkeeping is ready. Please use its tools to continue my previous request.',
    onAccepted: expect.any(Function),
  });
  expect(onHandled).toHaveBeenCalledWith(request.request_id);
  rerender(false);
  rerender(true);
  expect(fixture.widgetCtx.messageCtx.sendMessage).toHaveBeenCalledOnce();
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
  expect(fixture.widgetCtx.api.getConnectionAttempt).not.toHaveBeenCalled();
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
  expect(fixture.widgetCtx.api.getConnectionAttempt).not.toHaveBeenCalled();
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
  expect(fixture.widgetCtx.api.getConnectionAttempt).not.toHaveBeenCalled();
});

it('offers the same authorization URL if the browser blocks the popup', async () => {
  vi.mocked(window.open).mockReturnValue(null);
  const { result } = renderHook();
  await act(() => result.current.start());
  expect(result.current.phase).toBe('ready');
  expect(result.current.authorization?.host).toBe('accounts.example');
  fixture.widgetCtx.api.getConnectionAttempt.mockResolvedValue('connected');
  await act(async () => result.current.opened());
  expect(result.current.phase).toBe('connected');
  expect(fixture.widgetCtx.api.startConnection).toHaveBeenCalledOnce();
});

it('allows retry after a cancelled authorization without claiming success', async () => {
  const { result } = renderHook();
  await act(() => result.current.start());
  fixture.widgetCtx.api.getConnectionAttempt.mockResolvedValue('canceled');
  await tick();
  expect(result.current.phase).toBe('idle');
  expect(result.current.error).toBe('Connection was canceled. Try again.');
  fixture.widgetCtx.api.getConnectionAttempt.mockResolvedValue('pending');
  await act(() => result.current.start());
  expect(result.current.phase).toBe('waiting');
});

it('drops an old account response and closes its blank popup on identity change', async () => {
  let finish: (value: {
    authorization_url: string;
    completion: 'oauth';
    attempt_id: string;
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
  rerender(true, 'account-b');
  await act(async () => {
    finish({
      authorization_url: 'https://account-a.example/connect',
      completion: 'oauth',
      attempt_id: 'attempt-a',
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
    attempt_id: 'attempt-1',
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

it('bounds transient polling retries by the attempt deadline', async () => {
  const { result } = renderHook();
  fixture.widgetCtx.api.getConnectionAttempt.mockRejectedValue(
    new Error('Connection unavailable'),
  );
  await act(() => result.current.start());
  await act(async () => vi.advanceTimersByTimeAsync(6_000));
  expect(result.current.error).toBeNull();
  expect(result.current.phase).toBe('waiting');
  fixture.widgetCtx.api.getConnectionAttempt.mockResolvedValue('pending');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600_000);
  });
  expect(result.current.error).toBe('Connection timed out. Try again.');
  expect(result.current.phase).toBe('idle');
});

it('keeps a closed OAuth attempt usable until the backend reports its outcome', async () => {
  const { result } = renderHook();
  await act(() => result.current.start());
  tab.closed = true;
  await tick();
  expect(result.current.phase).toBe('ready');
  expect(result.current.authorization?.url).toBe(
    'https://accounts.example/authorize',
  );

  fixture.widgetCtx.api.getConnectionAttempt.mockResolvedValue('connected');
  await tick();
  expect(result.current.phase).toBe('connected');
  expect(fixture.widgetCtx.messageCtx.sendMessage).toHaveBeenCalledOnce();
});

it('times out and aborts a status request that never settles', async () => {
  let statusSignal: AbortSignal | undefined;
  fixture.widgetCtx.api.getConnectionAttempt.mockImplementation(
    async (_serverId: string, _attemptId: string, signal: AbortSignal) => {
      statusSignal = signal;
      return await new Promise<'pending'>(() => {});
    },
  );
  const { result } = renderHook();
  await act(() => result.current.start());
  await act(async () => vi.advanceTimersByTimeAsync(600_000));
  expect(statusSignal?.aborted).toBe(true);
  expect(result.current.error).toBe('Connection timed out. Try again.');
  expect(result.current.phase).toBe('idle');
});

it('keeps polling through transient errors and stops on the attempt outcome', async () => {
  const { result } = renderHook();
  fixture.widgetCtx.api.getConnectionAttempt
    .mockRejectedValueOnce(new Error('Temporary failure'))
    .mockRejectedValueOnce(new Error('Temporary failure'))
    .mockResolvedValueOnce('pending')
    .mockResolvedValueOnce('failed');
  await act(() => result.current.start());
  expect(result.current.phase).toBe('waiting');
  await act(async () => vi.advanceTimersByTimeAsync(8_000));
  expect(result.current.phase).toBe('idle');
  expect(result.current.error).toBe('Connection approval failed. Try again.');
  expect(fixture.widgetCtx.api.getConnectionAttempt).toHaveBeenCalledTimes(4);
});

it('turns an expired request into an accepted hidden renewal', async () => {
  fixture.widgetCtx.api.startConnection.mockRejectedValue(
    new ConnectionRequestExpiredError(),
  );
  const { result } = renderHook();
  await act(() => result.current.start());
  expect(fixture.widgetCtx.messageCtx.sendMessage).toHaveBeenCalledWith({
    background: true,
    connectionRequestId: request.request_id,
    content:
      'The connection request for Bookkeeping expired. Please create a new authorized connection request for Bookkeeping and continue my previous request.',
    onAccepted: expect.any(Function),
  });
  expect(onHandled).toHaveBeenCalledWith(request.request_id);
});

it('keeps dismissal recoverable until the existing send engine accepts it', async () => {
  fixture.widgetCtx.messageCtx.sendMessage.mockImplementation(async () => {});
  const { result } = renderHook();
  await act(() => result.current.cancel());
  expect(onHandled).not.toHaveBeenCalled();
  expect(fixture.widgetCtx.messageCtx.sendMessage).toHaveBeenCalledWith({
    content: 'Continue without connecting Bookkeeping.',
    connectionRequestId: request.request_id,
    onAccepted: expect.any(Function),
  });
  expect(result.current.error).toBe(
    'Could not continue your request. Try again.',
  );

  fixture.widgetCtx.messageCtx.sendMessage.mockImplementation(
    async (input: SendMessageInput) => input.onAccepted?.(),
  );
  await act(() => result.current.cancel());
  expect(onHandled).toHaveBeenCalledWith(request.request_id);
});

it('continues a newer request while the accepted prior send is still settling', async () => {
  let settleFirst: () => void = () => {};
  fixture.widgetCtx.messageCtx.sendMessage
    .mockImplementationOnce(
      async (input: SendMessageInput) =>
        await new Promise<void>((resolve) => {
          input.onAccepted?.();
          settleFirst = resolve;
        }),
    )
    .mockImplementationOnce(async (input: SendMessageInput) =>
      input.onAccepted?.(),
    );
  fixture.widgetCtx.api.getConnectionAttempt.mockResolvedValue('connected');
  const { result, rerender } = renderHook();
  await act(() => result.current.start());
  await tick();
  expect(fixture.widgetCtx.messageCtx.sendMessage).toHaveBeenCalledTimes(1);

  const nextRequest = {
    request_id: 'b2222222-2222-4222-8222-222222222222',
    server_id: 'a2222222-2222-4222-8222-222222222222',
    name: 'CRM',
  };
  rerender(true, 'account-a', nextRequest);
  await act(() => result.current.start());
  await tick();
  expect(fixture.widgetCtx.messageCtx.sendMessage).toHaveBeenCalledTimes(2);
  expect(onHandled).toHaveBeenCalledWith(nextRequest.request_id);
  await act(async () => settleFirst());
});
