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
    deliveredAt: null,
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
const features = { pageContext: true, clientTools: true, pageActions: true };

const fakeWidgetCtx = {
  agent: {},
  api: {
    getStreamTransportOptions: () => ({
      api: 'http://test/chat',
      reconnectApi: (id: string) => `http://test/chat/${id}`,
      headers: {},
    }),
    stopStream: vi.fn(async () => {}),
    sendPageReply: vi.fn(async () => {}),
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
      pageActions: features.pageActions,
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
    features.pageActions = true;
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
    expect(body.features).toEqual({
      page_context: false,
      page_actions: false,
      client_tools: false,
    });
  });

  it('config.features.clientTools=false: client_tools=false on the wire', async () => {
    const body = await renderAndSend(
      { ...baseConfig, features: { clientTools: false } },
      { content: 'hello' },
    );
    expect(body.features).toEqual({
      page_context: false,
      page_actions: false,
      client_tools: false,
    });
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
        // The adapter answers this exact call once it has performed it.
        callId: 'call-1',
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

  it('pointing alone never exposes a click request to the page adapter', async () => {
    features.pageActions = false;
    const actionTurn = {
      ...highlightTurn,
      parts: [
        {
          type: 'tool-act_on_page',
          toolCallId: 'action-1',
          state: 'input-available',
          input: { ref: 's1c1', action: 'click' },
        },
      ],
    };
    await act(async () => root.render(<Probe config={baseConfig} />));
    await act(async () =>
      setChatState({ status: 'streaming', messages: [actionTurn] }),
    );
    expect(hookValue?.pageEffects).toEqual([]);
    expect(fakeWidgetCtx.api.sendPageReply).toHaveBeenCalledWith('sess-1', {
      callId: 'action-1',
      outcome: 'declined',
    });
    features.pageActions = true;
    await act(async () => root.render(<Probe config={baseConfig} />));
    expect(hookValue?.pageEffects).toHaveLength(0);
    expect(fakeWidgetCtx.api.sendPageReply).toHaveBeenCalledOnce();
  });

  it.each(['pageActions', 'clientTools', 'pageContext'] as const)(
    'revoking %s declines the call and pending consent exactly once',
    async (feature) => {
      const turn = {
        ...highlightTurn,
        parts: [
          {
            type: 'tool-act_on_page',
            toolCallId: 'revoked',
            state: 'input-available',
            input: { ref: 's1c1', action: 'click' },
          },
        ],
      };
      await act(async () => root.render(<Probe config={baseConfig} />));
      await act(async () =>
        setChatState({ status: 'streaming', messages: [turn] }),
      );
      let consent: Promise<boolean> | undefined;
      await act(async () => {
        consent = hookValue?.requestPageActionConsent({
          callId: 'revoked',
          action: 'click',
          controlName: 'Save',
        });
      });
      expect(hookValue?.pendingPageAction).not.toBeNull();
      features[feature] = false;
      await act(async () => root.render(<Probe config={baseConfig} />));
      expect(hookValue?.pendingPageAction).toBeNull();
      await expect(consent).resolves.toBe(false);
      expect(fakeWidgetCtx.api.sendPageReply).not.toHaveBeenCalled();
      // The adapter owns an active consent call and reports its cancellation.
      await act(async () => hookValue?.replyToPageCall('revoked', 'declined'));
      expect(fakeWidgetCtx.api.sendPageReply).toHaveBeenCalledWith('sess-1', {
        callId: 'revoked',
        outcome: 'declined',
      });
      // The adapter can finish its cancelled consent promise on the next tick.
      hookValue?.replyToPageCall('revoked', 'declined');
      features[feature] = true;
      await act(async () => root.render(<Probe config={baseConfig} />));
      expect(hookValue?.pageEffects).toEqual([]);
      expect(fakeWidgetCtx.api.sendPageReply).toHaveBeenCalledOnce();
    },
  );

  it('declines a revoked call that has not reached an adapter', async () => {
    await act(async () => root.render(<Probe config={baseConfig} />));
    await act(async () =>
      setChatState({
        status: 'streaming',
        messages: [
          {
            ...highlightTurn,
            parts: [
              {
                type: 'tool-act_on_page',
                toolCallId: 'unclaimed',
                state: 'input-available',
                input: { ref: 's1c1', action: 'click' },
              },
            ],
          },
        ],
      }),
    );
    expect(hookValue?.pageEffects).toHaveLength(1);
    features.pageActions = false;
    await act(async () => root.render(<Probe config={baseConfig} />));
    expect(fakeWidgetCtx.api.sendPageReply).toHaveBeenCalledExactlyOnceWith(
      'sess-1',
      { callId: 'unclaimed', outcome: 'declined' },
    );
  });

  it('preserves the adapter outcome when permission is revoked after an approved action starts', async () => {
    await act(async () => root.render(<Probe config={baseConfig} />));
    await act(async () =>
      setChatState({
        status: 'streaming',
        messages: [
          {
            ...highlightTurn,
            parts: [
              {
                type: 'tool-act_on_page',
                toolCallId: 'started',
                state: 'input-available',
                input: { ref: 's1c1', action: 'click' },
              },
            ],
          },
        ],
      }),
    );
    let consent: Promise<boolean> | undefined;
    await act(async () => {
      consent = hookValue?.requestPageActionConsent({
        callId: 'started',
        action: 'click',
        controlName: 'Save',
      });
    });
    await act(async () => hookValue?.resolvePageAction('started', true));
    await expect(consent).resolves.toBe(true);
    features.pageActions = false;
    await act(async () => root.render(<Probe config={baseConfig} />));
    expect(fakeWidgetCtx.api.sendPageReply).not.toHaveBeenCalled();
    await act(async () => hookValue?.replyToPageCall('started', 'done'));
    expect(fakeWidgetCtx.api.sendPageReply).toHaveBeenCalledExactlyOnceWith(
      'sess-1',
      { callId: 'started', outcome: 'done' },
    );
  });

  it.each(['tool-act_on_page', 'tool-highlight_element'])(
    'does not replay a completed %s call',
    async (type) => {
      await act(async () => root.render(<Probe config={baseConfig} />));
      const part = {
        type,
        toolCallId: 'completed',
        state: 'input-available',
        input: { ref: 's1c1', action: 'click' },
      };
      await act(async () =>
        setChatState({
          status: 'streaming',
          messages: [{ ...highlightTurn, parts: [part] }],
        }),
      );
      expect(hookValue?.pageEffects).toHaveLength(1);
      await act(async () =>
        setChatState({
          status: 'streaming',
          messages: [
            {
              ...highlightTurn,
              parts: [
                {
                  ...part,
                  state: 'output-available',
                  output: { status: 'done' },
                },
              ],
            },
          ],
        }),
      );
      expect(hookValue?.pageEffects).toEqual([]);
    },
  );

  it('drops effects as soon as the turn stops', async () => {
    await act(async () => root.render(<Probe config={baseConfig} />));
    await act(async () =>
      setChatState({ status: 'streaming', messages: [highlightTurn] }),
    );
    expect(hookValue?.pageEffects).toHaveLength(1);
    await act(async () =>
      setChatState({ status: 'ready', messages: [highlightTurn] }),
    );
    expect(hookValue?.pageEffects).toEqual([]);
  });

  it('declines replaced and unmounted consent requests instead of leaving invisible prompts pending', async () => {
    await act(async () => root.render(<Probe config={baseConfig} />));
    await act(async () => setChatState({ status: 'streaming', messages: [] }));
    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    await act(async () => {
      first = hookValue?.requestPageActionConsent({
        callId: 'first',
        action: 'click',
        controlName: 'Delete first',
      });
    });
    await act(async () => {
      second = hookValue?.requestPageActionConsent({
        callId: 'second',
        action: 'click',
        controlName: 'Delete second',
      });
    });
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    await expect(first).resolves.toBe(false);
    expect(hookValue?.pendingPageAction?.callId).toBe('second');
    await act(async () => root.render(null));
    await expect(second).resolves.toBe(false);
  });

  it('withdraws page effects immediately when stop is requested, even before the SDK status changes', async () => {
    await act(async () => root.render(<Probe config={baseConfig} />));
    await act(async () =>
      setChatState({ status: 'streaming', messages: [highlightTurn] }),
    );
    expect(hookValue?.pageEffects).toHaveLength(1);
    await act(async () => hookValue?.stop());
    expect(hookValue?.pageEffects).toEqual([]);
  });

  it('sends an empty post-action snapshot to clear controls from the previous page', async () => {
    await act(async () => root.render(<Probe config={baseConfig} />));
    hookValue?.replyToPageCall('call', 'done', undefined, {
      controls: [],
      truncated: false,
    });
    expect(fakeWidgetCtx.api.sendPageReply).toHaveBeenCalledWith('sess-1', {
      callId: 'call',
      outcome: 'done',
      controls: [],
      truncated: false,
    });
  });
});
