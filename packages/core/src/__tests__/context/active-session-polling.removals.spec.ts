// A message a teammate deletes from the inbox stops coming back in the poll.
// An open widget must drop it on the next poll, while rows it only knows
// locally (an optimistic send, a stream not yet settled) stay put.
import { afterEach, expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ActiveSessionPollingCtx } from '../../context/active-session-polling.ctx';
import { ContactCtx } from '../../context/contact.ctx';
import { MessageCtx } from '../../context/message.ctx';
import { SessionCtx } from '../../context/session.ctx';
import type { MessageDto, SessionDto } from '../../types/dtos';
import type { WidgetUserMessage } from '../../types/messages';
import type { WidgetConfig } from '../../types/widget-config';

const session: SessionDto = {
  id: 'a3a3a3a3-0000-4000-8000-000000000001',
  ticketNumber: 1,
  title: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isHandedOff: false,
  isOpened: true,
  assignee: { kind: 'human', name: 'Dana', avatarUrl: null },
  channel: 'web',
  isVerified: false,
  lastMessage: null,
  modeId: null,
  latestStateCheckpointPayload: null,
  sessionAttributes: {},
  customStatus: null,
};

const A = 'b1b1b1b1-0000-4000-8000-00000000000a';
const B = 'b1b1b1b1-0000-4000-8000-00000000000b';

type PollResponse = Awaited<ReturnType<ApiCaller['pollSessionAndHistory']>>;

const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

function build(config: WidgetConfig = { token: 'tok' }) {
  const api = new ApiCaller({ config });
  const contactCtx = new ContactCtx({ api, config });
  const sessionCtx = new SessionCtx({
    config,
    api,
    contactCtx,
    sessionsPollingIntervalSeconds: 3600,
  });
  sessionCtx.sessionState.setPartial({ session });
  const messageCtx = new MessageCtx({
    config,
    api,
    sessionCtx,
    contactCtx,
    streaming: false,
    sendsPageContext: true,
  });
  const polling = new ActiveSessionPollingCtx({
    api,
    config,
    sessionCtx,
    messageCtx,
    sessionPollingIntervalSeconds: 3600,
  });
  disposers.push(polling.dispose);
  const pollSpy = vi.spyOn(api, 'pollSessionAndHistory');
  const poll = () =>
    polling.fetchSessionAndHistory({
      sessionId: session.id,
      abortSignal: new AbortController().signal,
    });
  const ids = () => messageCtx.state.get().messages.map((m) => m.id);
  return { sessionCtx, messageCtx, pollSpy, poll, ids };
}

function agentRow(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    publicId: 'b1b1b1b1-0000-4000-8000-000000000001',
    type: 'message',
    content: { text: 'Can we access your account?' },
    sender: { kind: 'agent', name: 'Dana' },
    sentAt: new Date().toISOString(),
    systemMessagePayload: { type: 'none' },
    ...overrides,
  };
}

function response(history: MessageDto[]): PollResponse {
  return {
    data: { session, history },
    error: undefined,
    response: new Response(),
  };
}

function deferred() {
  let resolve: (value: PollResponse) => void = () => {};
  const promise = new Promise<PollResponse>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

suite('poll removes rows the backend no longer returns', () => {
  test('a row present in an earlier poll and absent from the next one is removed', async () => {
    const { pollSpy, poll, ids, messageCtx } = build();
    pollSpy
      .mockResolvedValueOnce(
        response([agentRow({ publicId: A }), agentRow({ publicId: B })]),
      )
      .mockResolvedValueOnce(
        response([agentRow({ publicId: A }), agentRow({ publicId: B })]),
      )
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]));

    await poll();
    const afterFirstPoll = messageCtx.state.get().messages;
    await poll();

    expect(ids()).toEqual([A, B]);
    expect(messageCtx.state.get().messages).toBe(afterFirstPoll);

    await poll();

    expect(ids()).toEqual([A]);
  });

  test('a locally added row never seen in a poll survives an empty poll', async () => {
    const { pollSpy, poll, ids, messageCtx } = build();
    const userMessage: WidgetUserMessage = {
      id: 'local-1',
      type: 'USER',
      content: 'Hello?',
      deliveredAt: null,
      timestamp: new Date().toISOString(),
    };
    messageCtx.state.setPartial({ messages: [userMessage] });
    pollSpy
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]))
      .mockResolvedValueOnce(response([]));

    await poll();
    expect(ids()).toEqual(['local-1', A]);
    await poll();

    expect(ids()).toEqual(['local-1']);
  });

  test('an empty poll clears a row that an earlier poll delivered', async () => {
    const { pollSpy, poll, ids, messageCtx } = build();
    const dispatched = vi.spyOn(messageCtx, 'dispatchToOnMessageReceivedHook');
    const markedDispatched = vi.spyOn(
      messageCtx,
      'markAsDispatchedToOnMessageReceivedHook',
    );
    const loaderStates: boolean[] = [];
    messageCtx.state.subscribe((s) =>
      loaderStates.push(s.isInitialFetchLoading),
    );
    pollSpy
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([agentRow({ publicId: B })]));

    await poll();
    expect(loaderStates).toContain(true);
    expect(markedDispatched).toHaveBeenCalledWith([A]);
    loaderStates.length = 0;
    await poll();

    expect(ids()).toEqual([]);
    expect(messageCtx.state.get().isInitialFetchLoading).toBe(false);

    await poll();

    expect(ids()).toEqual([B]);
    expect(loaderStates).not.toContain(true);
    expect(dispatched).toHaveBeenCalledWith(expect.objectContaining({ id: B }));
    expect(markedDispatched).not.toHaveBeenCalledWith([B]);
  });

  test('a stale response cannot remove a row a newer response added', async () => {
    const { pollSpy, poll, ids } = build();
    const older = deferred();
    const newer = deferred();
    pollSpy
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]));

    const olderPoll = poll();
    const newerPoll = poll();
    newer.resolve(
      response([agentRow({ publicId: A }), agentRow({ publicId: B })]),
    );
    await newerPoll;
    older.resolve(response([agentRow({ publicId: A })]));
    await olderPoll;

    expect(ids()).toEqual([A, B]);

    await poll();

    expect(ids()).toEqual([A]);
  });

  test('a stale response that brings a removed row back loses it on the next poll', async () => {
    const { pollSpy, poll, ids } = build();
    const older = deferred();
    const newer = deferred();
    pollSpy
      .mockResolvedValueOnce(
        response([agentRow({ publicId: A }), agentRow({ publicId: B })]),
      )
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]));

    await poll();
    const olderPoll = poll();
    const newerPoll = poll();
    newer.resolve(response([agentRow({ publicId: A })]));
    await newerPoll;
    expect(ids()).toEqual([A]);
    older.resolve(
      response([agentRow({ publicId: A }), agentRow({ publicId: B })]),
    );
    await olderPoll;

    // The stale response was issued before the delete: B must not flicker back.
    expect(ids()).toEqual([A]);

    await poll();

    expect(ids()).toEqual([A]);
  });

  test('a request that overlapped the last applied response may add but not remove', async () => {
    // A tick and a post-stream reconcile are in flight together. The server
    // reads the later-issued one first, before the AI row R commits, so its
    // response lacks R while the earlier-issued one has it. Landing order is
    // the earlier one first: R must not blank out when the later one lands.
    const { pollSpy, poll, ids } = build();
    const R = 'b1b1b1b1-0000-4000-8000-00000000000c';
    const tick = deferred();
    const reconcile = deferred();
    pollSpy
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]))
      .mockReturnValueOnce(tick.promise)
      .mockReturnValueOnce(reconcile.promise)
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]));

    await poll();
    const tickPoll = poll();
    const reconcilePoll = poll();
    tick.resolve(
      response([agentRow({ publicId: A }), agentRow({ publicId: R })]),
    );
    await tickPoll;
    expect(ids()).toEqual([A, R]);
    reconcile.resolve(response([agentRow({ publicId: A })]));
    await reconcilePoll;

    expect(ids()).toEqual([A, R]);

    // A request issued after both landed is ordered: it may remove R.
    await poll();

    expect(ids()).toEqual([A]);
  });

  test('polls slower than the interval still remove a deleted row within a few polls', async () => {
    // Every request is issued before the previous response lands. Only a
    // response that could remove moves the cutoff, so the next request issued
    // after it may remove again; B must not stay forever.
    const { pollSpy, poll, ids } = build();
    const p2 = deferred();
    const p3 = deferred();
    const p4 = deferred();
    pollSpy
      .mockResolvedValueOnce(
        response([agentRow({ publicId: A }), agentRow({ publicId: B })]),
      )
      .mockReturnValueOnce(p2.promise)
      .mockReturnValueOnce(p3.promise)
      .mockReturnValueOnce(p4.promise);

    await poll();
    const poll2 = poll();
    const poll3 = poll();
    p2.resolve(
      response([agentRow({ publicId: A }), agentRow({ publicId: B })]),
    );
    await poll2;
    const poll4 = poll();
    p3.resolve(response([agentRow({ publicId: A })]));
    await poll3;
    expect(ids()).toEqual([A, B]);
    p4.resolve(response([agentRow({ publicId: A })]));
    await poll4;

    expect(ids()).toEqual([A]);
  });

  test('a kept reply loses its quote of a removed row', async () => {
    const { pollSpy, poll, messageCtx } = build();
    const quoted = {
      publicId: A,
      text: 'Can we access your account?',
      sender: { kind: 'agent' as const, name: 'Dana' },
    };
    pollSpy
      .mockResolvedValueOnce(
        response([
          agentRow({ publicId: A }),
          agentRow({ publicId: B, replyTo: quoted }),
        ]),
      )
      .mockResolvedValueOnce(
        response([agentRow({ publicId: B, replyTo: quoted })]),
      );

    await poll();
    const before = messageCtx.state.get().messages.find((m) => m.id === B);
    expect(before && 'replyTo' in before ? before.replyTo?.id : undefined).toBe(
      A,
    );

    await poll();

    const after = messageCtx.state.get().messages.find((m) => m.id === B);
    expect(after).toBeDefined();
    expect(after && 'replyTo' in after ? after.replyTo : null).toBeUndefined();
  });

  test('the poll bookkeeping resets with the conversation', async () => {
    const { sessionCtx, messageCtx, pollSpy, poll, ids } = build();
    const dispatched = vi.spyOn(messageCtx, 'dispatchToOnMessageReceivedHook');
    const markedDispatched = vi.spyOn(
      messageCtx,
      'markAsDispatchedToOnMessageReceivedHook',
    );
    pollSpy
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]))
      .mockResolvedValueOnce(response([agentRow({ publicId: A })]));

    await poll();
    expect(markedDispatched).toHaveBeenCalledWith([A]);
    markedDispatched.mockClear();

    // `WidgetCtx.resetChat` then `RouterCtx.toChatScreen(sameSessionId)`:
    // reopening the same session from the sessions list. Setting the session
    // starts the poller, whose first tick is the poll under test.
    await sessionCtx.reset();
    messageCtx.reset();
    sessionCtx.sessionState.setPartial({ session });
    await vi.waitFor(() => expect(ids()).toEqual([A]));

    expect(markedDispatched).toHaveBeenCalledWith([A]);
    expect(dispatched).not.toHaveBeenCalled();
    expect(pollSpy).toHaveBeenCalledTimes(2);
  });
});
