import { DefaultChatTransport } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentChatReconnectPreparer,
  appendPresentationParams,
  buildAgentChatTransport,
  type AgentChatTransportOptions,
} from '../agent-chat-transport';

const options: AgentChatTransportOptions = {
  api: 'https://api.test/backend/widget/v5/chat/stream',
  reconnectApi: (id) => `https://api.test/backend/widget/v5/chat/${id}/stream`,
  headers: () => ({ 'X-Bot-Token': 'tok', Authorization: 'Bearer user' }),
};

/** A finished UI message stream, as the backend sends it. */
function sseResponse() {
  const body = ['{"type":"start"}', '{"type":"finish"}', '[DONE]']
    .map((event) => `data: ${event}\n\n`)
    .join('');
  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
}

function requestedUrl(call: unknown[] | undefined): string {
  const input = call?.[0];
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  throw new Error('fetch was not called with a URL');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('agentChatReconnectPreparer (resume wiring)', () => {
  it('points a resume at the session-scoped GET with the auth headers', () => {
    const prepare = agentChatReconnectPreparer(options);
    expect(prepare({ id: 'sess-1' })).toEqual({
      api: 'https://api.test/backend/widget/v5/chat/sess-1/stream',
      headers: { 'X-Bot-Token': 'tok', Authorization: 'Bearer user' },
    });
  });
});

describe('buildAgentChatTransport', () => {
  it('constructs a DefaultChatTransport', () => {
    expect(buildAgentChatTransport(options)).toBeInstanceOf(
      DefaultChatTransport,
    );
  });

  it('sends and resumes through the given fetch, never the global one', async () => {
    const globalFetch = vi.fn(async () => sseResponse());
    vi.stubGlobal('fetch', globalFetch);
    const streamingFetch = vi.fn(async () => sseResponse());
    const transport = buildAgentChatTransport({
      ...options,
      fetch: streamingFetch,
    });

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'sess-1',
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    });
    await transport.reconnectToStream({ chatId: 'sess-1' });

    expect(streamingFetch.mock.calls.map(requestedUrl)).toEqual([
      'https://api.test/backend/widget/v5/chat/stream',
      'https://api.test/backend/widget/v5/chat/sess-1/stream',
    ]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('without a fetch, sends through the global fetch', async () => {
    const globalFetch = vi.fn(async () => sseResponse());
    vi.stubGlobal('fetch', globalFetch);
    const transport = buildAgentChatTransport(options);

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'sess-1',
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    });

    expect(globalFetch.mock.calls.map(requestedUrl)).toEqual([
      'https://api.test/backend/widget/v5/chat/stream',
    ]);
  });
});

describe('appendPresentationParams', () => {
  const url = 'https://api.test/backend/widget/v5/chat/sess-1/stream';

  it('leaves the URL alone without presentation choices', () => {
    expect(appendPresentationParams(url, undefined)).toBe(url);
    expect(appendPresentationParams(url, {})).toBe(url);
  });

  it('carries tool activity and reasoning, including reasoning=false', () => {
    expect(
      appendPresentationParams(url, {
        toolActivity: 'details',
        reasoning: false,
      }),
    ).toBe(`${url}?toolActivity=details&reasoning=false`);
    expect(appendPresentationParams(url, { reasoning: true })).toBe(
      `${url}?reasoning=true`,
    );
  });

  it('extends an existing query instead of starting a second one', () => {
    expect(
      appendPresentationParams(`${url}?a=1`, { toolActivity: 'status' }),
    ).toBe(`${url}?a=1&toolActivity=status`);
  });

  it('works where URLSearchParams.set is not implemented (React Native 0.76)', () => {
    vi.spyOn(URLSearchParams.prototype, 'set').mockImplementation(() => {
      throw new Error('URLSearchParams.set is not implemented');
    });
    // The stub is live: the URL API this replaced throws under it.
    expect(() => new URL(url).searchParams.set('reasoning', 'false')).toThrow(
      'URLSearchParams.set is not implemented',
    );

    expect(
      appendPresentationParams(url, {
        toolActivity: 'hidden',
        reasoning: false,
      }),
    ).toBe(`${url}?toolActivity=hidden&reasoning=false`);
  });
});
