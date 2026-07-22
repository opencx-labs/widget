import type { SendMessageInput, WidgetUserMessage } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * v5 send wiring for the element picker:
 * - a send WITHOUT per-message clientContext must NOT put a `clientContext`
 *   key on the body (an explicit `undefined` would override the transport's
 *   `config.context` default away);
 * - a send WITH clientContext merges it OVER config.context;
 * - `highlight_element` tool parts streaming in are performed on the host
 *   page exactly once per toolCallId.
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
    deliveredAt: null,
    pending: true,
  };
}

const fakeMessageCtx = {
  beginAgentTurn: vi.fn(async (input: SendMessageInput) => ({
    sessionId: 'sess-1',
    userMessage: buildUserMessage(input.content),
  })),
  buildQueuedUserMessage: vi.fn(),
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessagesDelivered: vi.fn(),
  reconcileAfterStream: null,
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({
    token: 't',
    context: { page: 'from-config', tenant: 'acme' },
    messageCustomData: { seat: 'pro' },
  }),
  useSessions: () => ({ sessionState: { session: { id: 'sess-1' } } }),
  useWidget: () => ({
    widgetCtx: {
      api: {
        getStreamTransportOptions: () => ({
          api: 'http://test/chat',
          reconnectApi: (id: string) => `http://test/chat/${id}`,
          headers: {},
        }),
        stopStream: vi.fn(async () => {}),
      },
      messageCtx: fakeMessageCtx,
    },
  }),
}));

import { useAgentChat } from '../useAgentChat';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

function Probe() {
  hookValue = useAgentChat();
  return null;
}

describe('useAgentChat clientContext + highlight_element', () => {
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
    document.body.innerHTML = '';
    document
      .querySelectorAll('[data-opencx-picker-overlay]')
      .forEach((el) => el.remove());
  });

  async function renderAndSend(input: SendMessageInput) {
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await hookValue?.send(input);
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    return sendMessageSpy.mock.calls[0]?.[1]?.body;
  }

  it('omits the clientContext key entirely when the send has none', async () => {
    const body = await renderAndSend({ content: 'hello' });
    expect(Object.keys(body)).not.toContain('clientContext');
    expect(body.custom_data).toEqual({ seat: 'pro' });
  });

  it('merges per-send clientContext OVER config.context', async () => {
    const picked = [{ name: 'button "Save"', selector: '#save' }];
    const body = await renderAndSend({
      content: 'what is this?',
      clientContext: { picked_elements: picked, page: 'from-send' },
    });
    expect(body.clientContext).toEqual({
      tenant: 'acme',
      page: 'from-send', // per-send wins the collision
      picked_elements: picked,
    });
  });

  it('performs a streamed highlight_element tool call on the host page — once per toolCallId', async () => {
    const target = document.createElement('button');
    target.id = 'create-key';
    target.textContent = 'Create Key';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

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

    const overlays = () => document.querySelectorAll('[data-opencx-picker-overlay]');
    expect(overlays()).toHaveLength(1);
    expect(target.scrollIntoView).toHaveBeenCalled();

    // The same part transitioning to output-available must NOT re-highlight.
    await act(async () => {
      setChatState({
        status: 'streaming',
        messages: [
          {
            ...assistantMessage,
            parts: [
              { ...assistantMessage.parts[0], state: 'output-available', output: { ok: true } },
            ],
          },
        ],
      });
    });
    expect(overlays()).toHaveLength(1);
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
              { type: 'tool-search_knowledge_base', toolCallId: 'c1', state: 'input-available', input: {} },
              { type: 'tool-highlight_element', toolCallId: 'c2', state: 'input-streaming', input: undefined },
              { type: 'text', text: 'hello' },
            ],
          },
        ],
      });
    });
    expect(document.querySelectorAll('[data-opencx-picker-overlay]')).toHaveLength(0);
  });
});
