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
 * Feature narrowing on the streaming engine. `WidgetCtx.sendsPageContext` and
 * `WidgetCtx.performsClientTools` are the org's features narrowed by the
 * embed; the engine only reads them:
 * - page context off → neither the send body nor the transport's request
 *   body carries `clientContext` (config context, page marks, host data);
 * - client tools off → a streamed `highlight_element` tool part is ignored.
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

function registeredSend(): (input: SendMessageInput) => Promise<void> | void {
  const handlers = fakeMessageCtx.registerAgentHandlers.mock.calls.at(-1)?.[0];
  if (!handlers) throw new Error('agent handlers were never registered');
  return handlers.send;
}

/** The narrowed answers a real WidgetCtx would give; flipped per test. */
const features = { pageContext: true, clientTools: true };

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
  get features() {
    return {
      dictation: false,
      attachments: true,
      pageContext: features.pageContext,
      clientTools: features.clientTools,
    };
  },
} as unknown as WidgetCtx;

import { useAgentChat } from '../useAgentChat';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

const contextGetter = vi.fn(() => ({
  page: { url: '/inbox' },
  tenant: 'acme',
}));

function Probe({ config }: { config: WidgetConfig }) {
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config,
    sessionId: 'sess-1',
    persistedMessages: [],
  });
  return null;
}

const baseConfig: WidgetConfig = {
  token: 't',
  context: contextGetter,
  messageCustomData: { seat: 'pro' },
};

const highlightTurn = {
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

describe('useAgentChat feature narrowing', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    features.pageContext = true;
    features.clientTools = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderAndSend(config: WidgetConfig, input: SendMessageInput) {
    await act(async () => {
      root.render(<Probe config={config} />);
    });
    await act(async () => {
      await registeredSend()(input);
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    return sendMessageSpy.mock.calls[0]?.[1]?.body;
  }

  it('page context on: config context and per-send marks ride the send', async () => {
    const marks = [{ shape: 'box', elements: [{ name: 'button "Save"' }] }];
    const body = await renderAndSend(baseConfig, {
      content: 'what is this?',
      clientContext: { page_marks: marks },
    });
    expect(body.clientContext).toEqual({
      page: { url: '/inbox' },
      tenant: 'acme',
      page_marks: marks,
    });
    expect(body.bot_token).toBe('t');
    expect(body.session_id).toBe('sess-1');
  });

  it('page context off: the host context still rides, the widget page marks do not, custom data intact', async () => {
    features.pageContext = false;
    const body = await renderAndSend(baseConfig, {
      content: 'what is this?',
      customData: { plan: 'gold' },
      clientContext: {
        page_marks: [{ shape: 'box', elements: [{ name: 'button "Save"' }] }],
        picked_elements: [{ name: 'btn' }],
      },
    });
    expect(body.clientContext).toEqual({
      page: { url: '/inbox' },
      tenant: 'acme',
    });
    expect(JSON.stringify(body)).not.toContain('page_marks');
    expect(JSON.stringify(body)).not.toContain('picked_elements');
    expect(body.custom_data).toEqual({ seat: 'pro', plan: 'gold' });
  });

  it('config.features.pageContext=false: page_context=false on the wire', async () => {
    features.pageContext = false;
    const body = await renderAndSend(
      { ...baseConfig, features: { pageContext: false } },
      { content: 'hello' },
    );
    expect(body.features).toEqual({ page_context: false });
  });

  it('config.features.clientTools=false: client_tools=false on the wire', async () => {
    const body = await renderAndSend(
      { ...baseConfig, features: { clientTools: false } },
      { content: 'hello' },
    );
    expect(body.features).toEqual({ client_tools: false });
  });

  it('client tools on: a streamed highlight tool part becomes a page effect', async () => {
    await act(async () => {
      root.render(<Probe config={baseConfig} />);
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: [highlightTurn] });
    });
    expect(hookValue?.pageEffects).toEqual([
      {
        key: 'sess-1:call-1',
        type: 'highlight-element',
        input: { selector: '#create-key', label: 'here' },
      },
    ]);
  });

  it('client tools off: the same streamed highlight tool part is ignored', async () => {
    features.clientTools = false;
    await act(async () => {
      root.render(<Probe config={baseConfig} />);
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: [highlightTurn] });
    });
    expect(hookValue?.pageEffects).toEqual([]);
  });
});
