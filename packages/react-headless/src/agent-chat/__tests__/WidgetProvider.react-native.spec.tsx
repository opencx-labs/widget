// @vitest-environment node
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetProvider } from '../../WidgetProvider';
import { useMessages } from '../../hooks/useMessages';
import { useAgentChatUi } from '../AgentChatContext';

/**
 * The whole streaming engine on a React Native-shaped host: no `document`,
 * `window` is the global object without DOM listeners, and the platform
 * fetch hands back the full body at once with no stream to read. The real
 * provider, core and AI SDK run against a mocked backend.
 */

const REPLY = 'Hello from the stream';
const sse =
  [
    { type: 'start', messageId: 'a1' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: REPLY },
    { type: 'text-end', id: 't1' },
    { type: 'finish' },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('') + 'data: [DONE]\n\n';
const sseHeaders = {
  'content-type': 'text/event-stream',
  'x-vercel-ai-ui-message-stream': 'v1',
};

function requestOf(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  return {
    path: new URL(request?.url ?? String(input)).pathname,
    method: init?.method ?? request?.method ?? 'GET',
  };
}

function apiResponse(path: string): unknown {
  if (path.endsWith('/widget/v2/config'))
    return {
      org: { id: 'org-1', name: 'Test' },
      modes: [],
      sessionPollingIntervalSeconds: 10,
      sessionsPollingIntervalSeconds: 60,
      agent: {
        name: 'Agent',
        avatar_url: null,
        streaming: true,
        features: {
          dictation: false,
          attachments: true,
          page_context: false,
          client_tools: false,
          page_actions: false,
        },
      },
    };
  if (path.endsWith('/contact/create-unverified'))
    return { token: 'contact-jwt', contact: { id: 'c1' } };
  if (path.endsWith('/widget/v2/sessions')) return { items: [], next: null };
  if (path.endsWith('/widget/v2/create-session'))
    return {
      id: 's1',
      isHandedOff: false,
      isOpened: true,
      isVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: null,
      channel: 'web',
      assignee: null,
    };
  if (path.endsWith('/messages')) return { turns: [] };
  return {};
}

/** React Native's fetch: JSON works, but a stream arrives with no `body`. */
const platformFetch = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const { path, method } = requestOf(input, init);
    if (path.endsWith('/v5/chat/stream') && method === 'POST')
      return new Proxy(new Response(sse, { headers: sseHeaders }), {
        get: (target, key) =>
          key === 'body' ? undefined : Reflect.get(target, key, target),
      });
    return Response.json(apiResponse(path));
  },
);

/** A fetch that streams, as `expo/fetch` does. */
const streamingFetch = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(sse, { headers: sseHeaders }),
);

let send: ReturnType<typeof useMessages>['sendMessage'] | null = null;
let ui: ReturnType<typeof useAgentChatUi> | null = null;

function Probe() {
  send = useMessages().sendMessage;
  ui = useAgentChatUi();
  return null;
}

const streamedText = () =>
  JSON.stringify([ui?.liveItems ?? [], ui?.turnSources ?? []]);

const streamRequests = (fetchMock: typeof platformFetch) =>
  fetchMock.mock.calls
    .map(([input, init]) => requestOf(input, init))
    .filter((request) => request.path.endsWith('/v5/chat/stream'));

describe('WidgetProvider streaming on a React Native-shaped host', () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    send = null;
    ui = null;
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('fetch', platformFetch);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    vi.unstubAllGlobals();
  });

  async function mountAndSend(options: { streamingFetch?: typeof fetch }) {
    expect(typeof document).toBe('undefined');
    await act(async () => {
      renderer = create(
        <WidgetProvider
          options={{ token: 'tok', streaming: true, ...options }}
          components={[{ key: 'fallback', component: () => null }]}
        >
          <Probe />
        </WidgetProvider>,
      );
    });
    await vi.waitFor(() => expect(send).not.toBeNull());
    await act(async () => {
      await send?.({ content: 'hi' });
    });
  }

  it('mounts without a DOM and streams the reply through streamingFetch', async () => {
    await mountAndSend({ streamingFetch });

    await vi.waitFor(async () => {
      await act(async () => {});
      expect(streamedText()).toContain(REPLY);
    });
    expect(streamRequests(streamingFetch)).toContainEqual({
      path: '/backend/widget/v5/chat/stream',
      method: 'POST',
    });
    expect(streamRequests(platformFetch)).toEqual([]);
  });

  it("without streamingFetch, the platform fetch's missing body yields no reply", async () => {
    await mountAndSend({});

    await vi.waitFor(() =>
      expect(streamRequests(platformFetch)).toContainEqual({
        path: '/backend/widget/v5/chat/stream',
        method: 'POST',
      }),
    );
    await act(async () => {});
    expect(streamedText()).not.toContain(REPLY);
  });
});
