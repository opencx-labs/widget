import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { MessageCtx } from '../../context/message.ctx';
import { SessionCtx } from '../../context/session.ctx';
import type { SessionDto } from '../../types/dtos';
import type { WidgetConfig } from '../../types/widget-config';

const session: SessionDto = {
  id: 'a3a3a3a3-0000-4000-8000-000000000001',
  ticketNumber: 1,
  title: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
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

function buildCtx({
  streaming,
  withSession = false,
}: {
  streaming: boolean;
  withSession?: boolean;
}) {
  const config: WidgetConfig = {
    token: 'tok',
    user: { token: 'contact-token' },
    advancedInitialMessages: [
      { message: 'Persistent greeting', persistent: true },
    ],
  };
  const api = new ApiCaller({ config });
  vi.spyOn(api, 'getSessions').mockResolvedValue({
    data: { items: [], next: null },
  } as unknown as Awaited<ReturnType<ApiCaller['getSessions']>>);
  const contactCtx = new ContactCtx({ api, config });
  const sessionCtx = new SessionCtx({
    config,
    api,
    contactCtx,
    sessionsPollingIntervalSeconds: 3600,
  });
  if (withSession) sessionCtx.sessionState.setPartial({ session });
  const messageCtx = new MessageCtx({
    config,
    api,
    sessionCtx,
    contactCtx,
    streaming,
    sendsPageContext: true,
  });
  return { api, messageCtx, sessionCtx };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MessageCtx send acceptance', () => {
  it('sends background context without staging or re-appending a user bubble', async () => {
    const { api, messageCtx } = buildCtx({
      streaming: false,
      withSession: true,
    });
    const requestSpy = vi.spyOn(api, 'sendMessage').mockResolvedValue({
      data: { success: true },
      response: new Response(),
    });
    await messageCtx.sendMessage({
      content: 'Connection ready',
      background: true,
    });
    expect(requestSpy).toHaveBeenCalledOnce();
    expect(requestSpy.mock.calls[0]?.[0]).toMatchObject({
      content: 'Connection ready',
      clientContext: { opencx__background: true },
    });
    const queued = messageCtx.buildQueuedUserMessage({
      content: 'Connection ready',
      background: true,
    });
    if (!queued) throw new Error('Expected a queued continuation');
    messageCtx.appendUserMessageIfAbsent(queued.userMessage);
    expect(
      messageCtx.state
        .get()
        .messages.filter((message) => message.type === 'USER'),
    ).toEqual([]);
    await messageCtx.sendMessage({ content: 'My next question' });
    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(
      messageCtx.state
        .get()
        .messages.filter((message) => message.type === 'USER')
        .map((message) => message.content),
    ).toEqual(['My next question']);
    expect(requestSpy.mock.calls[1]?.[0].clientContext).toBeUndefined();
  });

  it('allows polling after a silent streamed turn without releasing later unanswered sends', async () => {
    const { api, messageCtx } = buildCtx({
      streaming: false,
      withSession: true,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    messageCtx.state.setPartial({
      messages: [
        {
          id: 'silent-user',
          type: 'USER',
          content: 'first',
          timestamp: new Date().toISOString(),
        },
      ],
      settledAgentUserMessageId: 'silent-user',
    });
    let completeRequest = () => {};
    const request = new Promise<void>((resolve) => {
      completeRequest = resolve;
    });
    const requestSpy = vi
      .spyOn(api, 'sendMessage')
      .mockImplementation(async () => {
        await request;
        return { data: { success: true }, response: new Response() };
      });
    const onAccepted = vi.fn();
    const send = messageCtx.sendMessage({ content: 'second', onAccepted });
    await vi.waitFor(() => expect(onAccepted).toHaveBeenCalledOnce());
    await messageCtx.sendMessage({ content: 'while sending' });
    expect(requestSpy).toHaveBeenCalledOnce();
    completeRequest();
    await send;
    // Completion belongs only to the earlier user message. The new unanswered
    // send still follows the blocking engine's configured composer gate.
    await messageCtx.sendMessage({ content: 'while awaiting reply' });
    expect(requestSpy).toHaveBeenCalledOnce();
    messageCtx.reset();
    expect(messageCtx.state.get().settledAgentUserMessageId).toBeNull();
  });

  it('rolls back the agent first message and persistent greetings when session creation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { messageCtx, sessionCtx } = buildCtx({ streaming: true });
    vi.spyOn(sessionCtx, 'createSession').mockResolvedValue(null);
    const onAccepted = vi.fn();

    await expect(
      messageCtx.stageUserTurn(
        { content: 'hello', onAccepted },
        { pending: true },
      ),
    ).resolves.toBeNull();

    expect(messageCtx.state.get().messages).toEqual([]);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('does not accept a blocking first send and rolls back its optimistic rows when session creation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, messageCtx, sessionCtx } = buildCtx({ streaming: false });
    vi.spyOn(sessionCtx, 'createSession').mockResolvedValue(null);
    const requestSpy = vi.spyOn(api, 'sendMessage');
    const onAccepted = vi.fn();

    await messageCtx.sendMessage({ content: 'hello', onAccepted });

    expect(messageCtx.state.get().messages).toEqual([]);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('signals acceptance before the request wait without changing blocking send semantics', async () => {
    const { api, messageCtx } = buildCtx({
      streaming: false,
      withSession: true,
    });
    const order: string[] = [];
    let resolveRequest: (value: { data: { success: true } }) => void = () => {};
    const request = new Promise<{ data: { success: true } }>((resolve) => {
      resolveRequest = resolve;
    });
    vi.spyOn(api, 'sendMessage').mockImplementation(() => {
      order.push('request');
      return request as unknown as ReturnType<ApiCaller['sendMessage']>;
    });
    const onAccepted = vi.fn(() => order.push('accepted'));
    let settled = false;

    const send = messageCtx
      .sendMessage({ content: 'hello', onAccepted })
      .finally(() => {
        settled = true;
      });

    await vi.waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['accepted', 'request']);
    expect(settled).toBe(false);

    resolveRequest({ data: { success: true } });
    await send;
    expect(settled).toBe(true);
  });
});
