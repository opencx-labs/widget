import type {
  SendMessageInput,
  WidgetAiMessage,
  WidgetCtx,
  WidgetUserMessage,
} from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Agent send/effect wiring:
 * - a send WITHOUT per-message clientContext carries the config-level
 *   `config.context` as-is;
 * - a send WITH clientContext merges it OVER config.context;
 * - browser tool parts are normalized into a host-agnostic effect surface.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

const sendMessageSpy = vi.fn();
let setChatState: (next: ChatState) => void = () => {};

vi.mock('@ai-sdk/react', () => ({
  useChat: () => {
    const [state, setState] = React.useState<ChatState>({
      status: 'ready',
      messages: [],
    });
    setChatState = setState;
    return { ...state, sendMessage: sendMessageSpy, stop: vi.fn() };
  },
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

type PreparedAgentTurn = {
  sessionId: string;
  userMessage: WidgetUserMessage;
  initialMessages?: WidgetAiMessage[];
} | null;

const fakeMessageCtx = {
  beginAgentTurn: vi.fn(
    async (input: SendMessageInput): Promise<PreparedAgentTurn> => ({
      sessionId: 'sess-1',
      userMessage: buildUserMessage(input.content),
    }),
  ),
  buildQueuedUserMessage: vi.fn(),
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessageDelivered: vi.fn(),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

// The engine exposes `send` by registering it with MessageCtx (the shared
// `sendMessage` entry point) — drive sends through that seam, like production.
function registeredSend(): (input: SendMessageInput) => Promise<void> | void {
  const handlers = fakeMessageCtx.registerAgentHandlers.mock.calls.at(-1)?.[0];
  if (!handlers) throw new Error('agent handlers were never registered');
  return handlers.send;
}

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
} as unknown as WidgetCtx;

import { useAgentChat } from '../useAgentChat';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

function Probe() {
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config: {
      token: 't',
      context: { page: 'from-config', tenant: 'acme' },
      messageCustomData: { seat: 'pro' },
    },
    sessionId: 'sess-1',
    persistedMessages: [],
  });
  return null;
}

describe('useAgentChat clientContext + page effects', () => {
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

  async function renderAndSend(input: SendMessageInput) {
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await registeredSend()(input);
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    return sendMessageSpy.mock.calls[0]?.[1]?.body;
  }

  it('carries config.context unchanged when the send has no clientContext', async () => {
    const body = await renderAndSend({ content: 'hello' });
    expect(body.clientContext).toEqual({ page: 'from-config', tenant: 'acme' });
    expect(body.custom_data).toEqual({ seat: 'pro' });
  });

  it('merges per-send clientContext OVER config.context', async () => {
    const marks = [{ shape: 'box', elements: [{ name: 'button "Save"' }] }];
    const body = await renderAndSend({
      content: 'what is this?',
      clientContext: { page_marks: marks, page: 'from-send' },
    });
    expect(body.clientContext).toEqual({
      tenant: 'acme',
      page: 'from-send', // per-send wins the collision
      page_marks: marks,
    });
  });

  it('carries the exit-mode prompt on the streamed agent turn', async () => {
    const body = await renderAndSend({
      content: 'leave support mode',
      exitModePrompt: 'Close politely and summarize the resolution.',
    });

    expect(body.exit_mode_prompt).toBe(
      'Close politely and summarize the resolution.',
    );
  });

  it('signals acceptance only after the prepared turn is enqueued', async () => {
    const onAccepted = vi.fn();

    await renderAndSend({ content: 'accepted', onAccepted });

    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(fakeMessageCtx.beginAgentTurn).toHaveBeenCalledTimes(1);
  });

  it('does not signal acceptance when first-session preparation fails', async () => {
    fakeMessageCtx.beginAgentTurn.mockResolvedValueOnce(null);
    const onAccepted = vi.fn();
    await act(async () => {
      root.render(<Probe />);
    });

    await act(async () => {
      await registeredSend()({ content: 'not accepted', onAccepted });
    });

    expect(onAccepted).not.toHaveBeenCalled();
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('carries persistent initial messages on the first streamed turn', async () => {
    const greeting: WidgetAiMessage = {
      id: 'greeting-1',
      component: 'bot_message',
      type: 'AI',
      timestamp: new Date().toISOString(),
      data: { message: 'Persistent greeting' },
    };
    fakeMessageCtx.beginAgentTurn.mockResolvedValueOnce({
      sessionId: 'sess-1',
      userMessage: buildUserMessage('hello'),
      initialMessages: [greeting],
    });

    const body = await renderAndSend({ content: 'hello' });

    expect(body.initial_messages).toEqual([
      { uuid: 'greeting-1', content: 'Persistent greeting' },
    ]);
  });

  it('normalizes a completed highlight tool part without touching the host page', async () => {
    await act(async () => {
      root.render(<Probe />);
    });

    const assistantMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-highlight_element',
          toolCallId: 'call-1',
          state: 'input-available',
          input: { selector: '#create-key', label: 'here' },
        },
      ],
    };
    await act(async () => {
      setChatState({ status: 'streaming', messages: [assistantMessage] });
    });

    expect(hookValue?.pageEffects).toEqual([
      {
        key: 'sess-1:call-1',
        type: 'highlight-element',
        input: { selector: '#create-key', label: 'here' },
      },
    ]);
  });

  it('ignores unrelated and still-streaming tool parts', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      setChatState({
        status: 'streaming',
        messages: [
          {
            id: 'a1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-search_knowledge_base',
                toolCallId: 'c1',
                state: 'input-available',
                input: {},
              },
              {
                type: 'tool-highlight_element',
                toolCallId: 'c2',
                state: 'input-streaming',
                input: undefined,
              },
              { type: 'text', text: 'hello' },
            ],
          },
        ],
      });
    });
    expect(hookValue?.pageEffects).toEqual([]);
  });
});
