import type {
  SendMessageInput,
  StagedUserTurn,
  WidgetConfig,
  WidgetCtx,
} from '@opencx/widget-core';
import { DefaultChatTransport, type UIMessage } from 'ai';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a React Native host needs from the streaming engine:
 * - the embedder's `streamingFetch` (the api layer hands it over) carries the
 *   stream, because React Native's own fetch cannot read a response as it
 *   arrives;
 * - the resume request carries the presentation choices without
 *   `URLSearchParams.set`, which React Native 0.76 does not implement;
 * - a dropped reply can be resumed on the host's own signal
 *   (`resumeInterruptedTurn`), since there is no tab visibility to listen to.
 */

let capturedTransport: DefaultChatTransport<UIMessage> | null = null;
let setChatError: (error: Error | undefined) => void = () => {};
const resumeStreamSpy = vi.fn();

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { transport?: unknown }) => {
    if (options.transport instanceof DefaultChatTransport)
      capturedTransport = options.transport;
    const [error, setError] = React.useState<Error | undefined>(undefined);
    setChatError = setError;
    return {
      status: error ? 'error' : 'ready',
      messages: [],
      error,
      sendMessage: vi.fn(),
      stop: vi.fn(),
      clearError: vi.fn(),
      resumeStream: resumeStreamSpy,
    };
  },
}));

function sseResponse() {
  return new Response('data: {"type":"start"}\n\ndata: [DONE]\n\n', {
    headers: {
      'content-type': 'text/event-stream',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
}

const streamingFetch = vi.fn(async () => sseResponse());

const fakeMessageCtx = {
  stageUserTurn: vi.fn(
    async (_input: SendMessageInput): Promise<StagedUserTurn | null> => null,
  ),
  buildQueuedUserMessage: vi.fn(),
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessageDelivered: vi.fn(),
  notifySendAccepted: vi.fn(),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

const fakeWidgetCtx = {
  agent: {},
  api: {
    getStreamTransportOptions: () => ({
      api: 'http://test/chat',
      reconnectApi: (id: string) => `http://test/chat/${id}`,
      headers: {},
      fetch: streamingFetch,
    }),
    stopStream: vi.fn(async () => {}),
    sendPageReply: vi.fn(async () => {}),
    getAgentTurnMessages: vi.fn(async () => null),
  },
  messageCtx: fakeMessageCtx,
  reconcileAfterStream: vi.fn(async () => {}),
  features: {
    dictation: false,
    attachments: true,
    pageContext: false,
    clientTools: false,
    pageActions: false,
  },
} as unknown as WidgetCtx;

import { useAgentChat } from '../useAgentChat';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

function Probe({ config }: { config: WidgetConfig }) {
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config,
    sessionId: 'sess-1',
    persistedMessages: [],
  });
  return null;
}

function requestedUrl(call: unknown[] | undefined): string {
  const input = call?.[0];
  if (typeof input === 'string') return input;
  if (input instanceof Request) return input.url;
  throw new Error('fetch was not called with a URL string');
}

describe('useAgentChat on a React Native host', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedTransport = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resumes through streamingFetch, presentation intact, where URLSearchParams.set throws', async () => {
    const globalFetch = vi.fn(async () => sseResponse());
    vi.stubGlobal('fetch', globalFetch);
    vi.spyOn(URLSearchParams.prototype, 'set').mockImplementation(() => {
      throw new Error('URLSearchParams.set is not implemented');
    });
    await act(async () =>
      root.render(
        <Probe
          config={{
            token: 't',
            presentation: { toolActivity: 'details', reasoning: false },
          }}
        />,
      ),
    );

    await capturedTransport?.reconnectToStream({ chatId: 'sess-1' });

    expect(streamingFetch.mock.calls.map(requestedUrl)).toEqual([
      'http://test/chat/sess-1?toolActivity=details&reasoning=false',
    ]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('resumeInterruptedTurn is a no-op on a healthy turn and resumes a failed one', async () => {
    await act(async () => root.render(<Probe config={{ token: 't' }} />));

    await act(async () => hookValue?.resumeInterruptedTurn());
    expect(resumeStreamSpy).not.toHaveBeenCalled();

    await act(async () => setChatError(new Error('network lost')));
    await act(async () => hookValue?.resumeInterruptedTurn());
    expect(resumeStreamSpy).toHaveBeenCalledOnce();
  });
});
