import type {
  SendMessageInput,
  StagedUserTurn,
  WidgetConfig,
  WidgetCtx,
  WidgetUserMessage,
} from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The streamed turn's request body carries `config.features` snake_cased as
 * `features`, and omits the field entirely when the embedder set nothing —
 * the same wire body the blocking engine sends (`buildSendMessageBody`).
 */

const sendMessageSpy = vi.fn();
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    status: 'ready',
    messages: [],
    sendMessage: sendMessageSpy,
    stop: vi.fn(),
  }),
}));

vi.mock('../agent-chat-transport', () => ({
  buildAgentChatTransport: () => ({}),
}));

function buildUserMessage(content: string): WidgetUserMessage {
  return {
    id: `msg-${content}`,
    type: 'USER',
    content,
    timestamp: new Date().toISOString(),
    pending: true,
  };
}

const fakeMessageCtx = {
  stageUserTurn: vi.fn(
    async (input: SendMessageInput): Promise<StagedUserTurn | null> => ({
      sessionId: 'sess-1',
      userMessage: buildUserMessage(input.content),
      initialMessages: [],
    }),
  ),
  buildQueuedUserMessage: vi.fn(),
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessageDelivered: vi.fn(),
  notifySendAccepted: vi.fn((input: SendMessageInput) => input.onAccepted?.()),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

const fakeWidgetCtx = {
  api: {
    getStreamTransportOptions: () => ({
      api: 'http://test/chat',
      reconnectApi: (id: string) => `http://test/chat/${id}`,
      headers: {},
    }),
    stopStream: vi.fn(async () => {}),
    getAgentTurnMessages: vi.fn(async () => null),
  },
  messageCtx: fakeMessageCtx,
  reconcileAfterStream: vi.fn(async () => {}),
  features: {
    dictation: false,
    attachments: true,
    pageContext: true,
    clientTools: true,
  },
} as unknown as WidgetCtx;

import { useAgentChat } from '../useAgentChat';

function Probe({ config }: { config: WidgetConfig }) {
  useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config,
    sessionId: 'sess-1',
    persistedMessages: [],
  });
  return null;
}

describe('useAgentChat stream body — features', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function bodyFor(
    config: WidgetConfig,
  ): Promise<Record<string, unknown>> {
    await act(async () => {
      root.render(<Probe config={config} />);
    });
    const handlers =
      fakeMessageCtx.registerAgentHandlers.mock.calls.at(-1)?.[0];
    if (!handlers) throw new Error('agent handlers were never registered');
    await act(async () => {
      await handlers.send({ content: 'hello' });
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    return sendMessageSpy.mock.calls[0]?.[1]?.body;
  }

  it('sends `features` snake_cased when configured', async () => {
    const body = await bodyFor({
      token: 't',
      features: { preamble: false, inlineUi: true },
    });
    expect(body.features).toEqual({ preamble: false, inline_ui: true });
    expect(body.bot_token).toBe('t');
    expect(body.session_id).toBe('sess-1');
    expect(body.uuid).toBe('msg-hello');
  });

  it('leaves `features` undefined when the option is not set', async () => {
    // Like `headers` / `query_params` beside it: an undefined field, which the
    // JSON serialization drops — the wire body carries no `features` key.
    const body = await bodyFor({ token: 't' });
    expect(body.features).toBeUndefined();
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('features');
  });
});
