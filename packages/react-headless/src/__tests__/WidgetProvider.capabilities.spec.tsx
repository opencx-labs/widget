import { transferableAbortController } from 'node:util';
import type { SessionDto, WidgetConfig, WidgetCtx } from '@opencx/widget-core';
import type { UIMessage } from 'ai';
import React, { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetProvider, useWidget } from '../WidgetProvider';
import { useMessages } from '../hooks/useMessages';
import { useAgentChatUi } from '../agent-chat/AgentChatContext';

const streamSend = vi.fn(async (_message: { text: string }) => {});
let setStreamStatus: (
  status: 'ready' | 'submitted' | 'streaming',
) => void = () => {};
let setStreamMessages: (messages: UIMessage[]) => void = () => {};
let latestUi: ReturnType<typeof useAgentChatUi> | undefined;
vi.mock('@ai-sdk/react', () => ({
  useChat: () => {
    const [status, setStatus] = React.useState<
      'ready' | 'submitted' | 'streaming'
    >('ready');
    setStreamStatus = setStatus;
    const [messages, setMessages] = React.useState<UIMessage[]>([]);
    setStreamMessages = setMessages;
    return {
      status,
      messages,
      sendMessage: streamSend,
      stop: vi.fn(),
      resumeStream: vi.fn(),
    };
  },
}));

const session: SessionDto = {
  id: 'a3a3a3a3-0000-4000-8000-000000000001',
  ticketNumber: 1,
  title: null,
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  isHandedOff: false,
  isOpened: true,
  assignee: { kind: 'ai', name: null, avatarUrl: null },
  channel: 'web',
  isVerified: false,
  lastMessage: null,
  modeId: null,
  latestStateCheckpointPayload: null,
  sessionAttributes: {},
  customStatus: null,
};

function SendProbe({ onContext }: { onContext: (ctx: WidgetCtx) => void }) {
  const { widgetCtx } = useWidget();
  latestUi = useAgentChatUi();
  const { sendMessage } = useMessages();
  useLayoutEffect(() => {
    widgetCtx.sessionCtx.sessionState.setPartial({ session });
    onContext(widgetCtx);
  }, [widgetCtx, onContext]);
  return (
    <button onClick={() => void sendMessage({ content: 'hello' })}>Send</button>
  );
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('WidgetProvider blocking capability updates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([undefined, 'companion'] as const)(
    'uses the latest declaration on the same initialized client after opt-in, opt-out, and removal (%s)',
    async (displayMode) => {
      // Node's Request requires its own AbortSignal, rather than jsdom's version.
      vi.stubGlobal(
        'AbortController',
        class {
          constructor() {
            return transferableAbortController();
          }
        },
      );
      const bodies: unknown[] = [];
      let configFetches = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          if (request.url.endsWith('/config')) {
            configFetches += 1;
            return jsonResponse({
              org: { id: 'org-1', name: 'Org' },
              sessionPollingIntervalSeconds: 3600,
              sessionsPollingIntervalSeconds: 3600,
              modes: [],
              agent: {
                name: 'Agent',
                avatar_url: null,
                streaming: true,
                features: {
                  preamble: false,
                  inline_ui: false,
                  dictation: false,
                  attachments: true,
                  page_context: true,
                  client_tools: false,
                },
              },
            });
          }
          if (request.url.includes('/poll'))
            return jsonResponse({ session, history: [] });
          if (request.url.endsWith('/chat/send')) {
            const body: unknown = JSON.parse(await request.text());
            bodies.push(body);
            return jsonResponse({
              success: true,
              autopilotResponse: { value: { content: 'Reply' } },
            });
          }
          throw new Error(
            `Unexpected request: ${request.method} ${request.url}`,
          );
        }),
      );
      const contexts = new Set<WidgetCtx>();
      const onContext = (ctx: WidgetCtx) => {
        contexts.add(ctx);
      };
      const container = document.createElement('div');
      const root = createRoot(container);
      try {
        for (const structuredQuestions of [undefined, true, false, undefined]) {
          const options: WidgetConfig = {
            token: 'token',
            displayMode,
            streaming: false,
            presentation: {
              toolActivity: structuredQuestions ? 'details' : 'hidden',
              reasoning: structuredQuestions === true,
            },
            features: {
              preamble: structuredQuestions === true,
              pageContext: structuredQuestions === true,
            },
            collectUserData: true,
            capabilities:
              structuredQuestions === undefined
                ? undefined
                : { structuredQuestions },
          };
          await act(async () =>
            root.render(
              <WidgetProvider
                options={options}
                components={[{ key: 'fallback', component: () => null }]}
              >
                <SendProbe onContext={onContext} />
              </WidgetProvider>,
            ),
          );
          const button = container.querySelector('button');
          if (!button) throw new Error('Widget did not initialize');
          const before = bodies.length;
          await act(async () => button.click());
          expect(bodies).toHaveLength(before + 1);
          expect(bodies.at(-1)).toMatchObject({
            presentation: options.presentation,
            features: { preamble: options.features?.preamble },
          });
          expect(Array.from(contexts)[0]?.streaming).toBe(false);
          expect(Array.from(contexts)[0]?.features.pageContext).toBe(
            structuredQuestions === true,
          );
          expect(Array.from(contexts)[0]?.messageCtx.sendsPageContext).toBe(
            structuredQuestions === true,
          );
          if (structuredQuestions === undefined)
            expect(bodies.at(-1)).not.toHaveProperty('capabilities');
          else
            expect(bodies.at(-1)).toMatchObject({
              capabilities: { structured_questions: structuredQuestions },
            });
        }
        expect(configFetches).toBe(1);
        expect(contexts.size).toBe(1);
        expect(
          Array.from(contexts)[0]?.messageCtx.state.get().messages,
        ).toHaveLength(8);
      } finally {
        act(() => {
          root.unmount();
          contexts.forEach((ctx) => ctx.resetChat());
        });
      }
    },
  );
});

it('keeps accepted queued sends through a polling opt-out, then sends new work through polling', async () => {
  vi.stubGlobal(
    'AbortController',
    class {
      constructor() {
        return transferableAbortController();
      }
    },
  );
  streamSend.mockClear();
  const pollingBodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      if (request.url.endsWith('/config'))
        return jsonResponse({
          org: { id: 'org', name: 'Org' },
          sessionPollingIntervalSeconds: 3600,
          sessionsPollingIntervalSeconds: 3600,
          modes: [],
          agent: {
            name: 'Agent',
            avatar_url: null,
            streaming: true,
            features: {
              preamble: false,
              inline_ui: false,
              dictation: false,
              attachments: true,
              page_context: false,
              client_tools: false,
            },
          },
        });
      if (request.url.includes('/messages')) return jsonResponse({ turns: [] });
      if (request.url.includes('/poll'))
        return jsonResponse({ session, history: [] });
      if (request.url.endsWith('/chat/send')) {
        pollingBodies.push(await request.json());
        return jsonResponse({
          success: true,
          autopilotResponse: { value: { content: 'Done' } },
        });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    }),
  );
  let ctx: WidgetCtx | undefined;
  const onContext = (value: WidgetCtx) => {
    ctx = value;
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (streaming: boolean) =>
    root.render(
      <WidgetProvider
        components={[{ key: 'fallback', component: () => null }]}
        options={{ token: 't', collectUserData: true, streaming }}
      >
        <SendProbe onContext={onContext} />
      </WidgetProvider>,
    );
  try {
    await act(async () => render(true));
    if (!ctx) throw new Error('Widget did not initialize');
    const current = ctx;
    let persistReply = true;
    let finishReconcile = () => {};
    const reconcileGate = new Promise<void>((resolve) => {
      finishReconcile = resolve;
    });
    vi.spyOn(ctx, 'reconcileAfterStream').mockImplementation(async () => {
      await reconcileGate;
      if (!persistReply) return;
      current.messageCtx.state.setPartial({
        messages: [
          ...current.messageCtx.state.get().messages,
          {
            id: crypto.randomUUID(),
            type: 'AI',
            component: 'bot_message',
            timestamp: new Date().toISOString(),
            data: { message: 'Done' },
          },
        ],
      });
    });
    const stageUserTurn = ctx.messageCtx.stageUserTurn.bind(ctx.messageCtx);
    let finishPreparation = () => {};
    const preparationGate = new Promise<void>((resolve) => {
      finishPreparation = resolve;
    });
    vi.spyOn(ctx.messageCtx, 'stageUserTurn').mockImplementationOnce(
      async (...args) => {
        await preparationGate;
        return stageUserTurn(...args);
      },
    );
    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = current.messageCtx.sendMessage({ content: 'first' });
    });
    await act(async () => render(false));
    expect(current.streaming).toBe(true);
    expect(streamSend).not.toHaveBeenCalled();
    await act(async () => {
      finishPreparation();
      await firstSend;
    });
    expect(streamSend).toHaveBeenCalledOnce();
    await act(async () => render(true));
    await act(async () => setStreamStatus('submitted'));
    const accepted = vi.fn();
    await act(async () => {
      await ctx?.messageCtx.sendMessage({
        content: 'second',
        onAccepted: accepted,
      });
    });
    expect(accepted).toHaveBeenCalledOnce();
    expect(
      latestUi?.queuedUserMessages.map((message) => message.content),
    ).toEqual(['second']);
    await act(async () => render(false));
    expect(
      latestUi?.queuedUserMessages.map((message) => message.content),
    ).toEqual(['second']);
    await act(async () => setStreamStatus('ready'));
    // The response is over, but its canonical rows have not arrived yet.
    await act(async () => render(false));
    expect(current.streaming).toBe(true);
    expect(streamSend).toHaveBeenCalledOnce();
    expect(
      latestUi?.queuedUserMessages.map((message) => message.content),
    ).toEqual(['second']);
    await act(async () => finishReconcile());
    expect(streamSend).toHaveBeenCalledTimes(2);
    expect(streamSend.mock.calls.map((call) => call[0])).toEqual([
      { text: 'first' },
      { text: 'second' },
    ]);
    persistReply = false;
    await act(async () => {
      setStreamStatus('streaming');
      setStreamMessages([
        {
          id: 'reply-2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Second reply.' }],
        },
      ]);
    });
    await act(async () => setStreamStatus('ready'));
    // An empty reconciliation must not detach the only copy of the reply.
    await act(async () => render(false));
    expect(current.streaming).toBe(true);
    expect(latestUi?.liveItems).toEqual([
      { kind: 'text', text: 'Second reply.' },
    ]);
    await act(async () => {
      current.messageCtx.state.setPartial({
        messages: [
          ...current.messageCtx.state.get().messages,
          {
            id: 'persisted-second-reply',
            type: 'AI',
            component: 'bot_message',
            timestamp: new Date().toISOString(),
            data: { message: 'Second reply.' },
          },
        ],
      });
    });
    expect(current.streaming).toBe(false);
    await act(async () => {
      await ctx?.messageCtx.sendMessage({ content: 'third' });
    });
    expect(pollingBodies).toHaveLength(1);
    expect(pollingBodies[0]).toMatchObject({ content: 'third' });
    expect(streamSend).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    ctx?.resetChat();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
