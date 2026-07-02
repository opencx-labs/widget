import '../../api-caller.mock';

import { ApiCaller } from '../../../api/api-caller';
import { WidgetCtx } from '../../../context/widget.ctx';
import type { MessageDto, SessionDto } from '../../../types/dtos';
import type {
  WidgetAgentMessage,
  WidgetAiMessage,
  WidgetMessageU,
  WidgetSystemMessageU,
} from '../../../types/messages';
import { genUuid } from '../../../utils/uuid';
import { TestUtils } from '../../test-utils';

/* ------------------------------------------------------ */
/*                        Helpers                         */
/* ------------------------------------------------------ */

const makeSessionDto = (overrides: Partial<SessionDto> = {}): SessionDto => ({
  id: genUuid(),
  ticketNumber: 1,
  title: null,
  assignee: { kind: 'ai', name: null, avatarUrl: null },
  channel: '',
  createdAt: new Date().toISOString(),
  isHandedOff: false,
  isOpened: true,
  isVerified: false,
  lastMessage: '',
  updatedAt: new Date().toISOString(),
  modeId: null,
  latestStateCheckpointPayload: null,
  sessionAttributes: {},
  ...overrides,
});

const makeHistoryItem = (
  overrides: Partial<MessageDto> & Pick<MessageDto, 'sender' | 'publicId'>,
): MessageDto => ({
  type: 'message',
  content: { text: 'some-text' },
  sentAt: new Date().toISOString(),
  attachments: null,
  actionCalls: null,
  systemMessagePayload: { type: 'none' },
  ...overrides,
});

const aiHistoryItem = (id = genUuid(), text = 'ai-text'): MessageDto =>
  makeHistoryItem({
    publicId: id,
    content: { text },
    sender: { kind: 'ai', name: null, avatar: null },
  });

const agentHistoryItem = (id = genUuid(), text = 'agent-text'): MessageDto =>
  makeHistoryItem({
    publicId: id,
    content: { text },
    sender: { kind: 'agent', name: 'Jane', avatar: null },
  });

const userHistoryItem = (id = genUuid(), text = 'user-text'): MessageDto =>
  makeHistoryItem({
    publicId: id,
    content: { text },
    sender: { kind: 'user', name: null, avatar: null },
  });

const csatRequestedHistoryItem = (id = genUuid()): MessageDto =>
  makeHistoryItem({
    publicId: id,
    type: 'csat_requested',
    content: { text: null },
    sender: { kind: 'system', name: null, avatar: null },
    systemMessagePayload: { type: 'csat_requested', payload: undefined },
  });

/**
 * Drives a single polling pass by setting the session on `sessionCtx`,
 * which makes `ActiveSessionPollingCtx` start its poller — the poller
 * fires its callback immediately on first run.
 */
const triggerPoll = async (widgetCtx: WidgetCtx, session: SessionDto) => {
  widgetCtx.sessionCtx.sessionState.setPartial({ session });
  // Give the immediate-first-fire of Poller + the awaited API call time to settle.
  await TestUtils.sleep(50);
};

/**
 * Forces a fresh poll cycle by resetting the session to null and re-setting it.
 * `Poller.startPolling` is a no-op while already polling, so we tear it down
 * and let the subscriber restart it. Useful for driving N polls in a row.
 */
const restartPoll = async (widgetCtx: WidgetCtx, session: SessionDto) => {
  widgetCtx.sessionCtx.sessionState.setPartial({ session: null });
  await TestUtils.sleep(20);
  widgetCtx.sessionCtx.sessionState.setPartial({ session });
  await TestUtils.sleep(50);
};

/**
 * Pushes a dummy USER message into the message state so the next poll is
 * treated as a regular poll-for-new-messages rather than an initial history
 * load (which suppresses the hook).
 */
const seedMessageStateAsAlreadyLoaded = (widgetCtx: WidgetCtx) => {
  const seed: WidgetMessageU = {
    id: genUuid(),
    type: 'USER',
    content: '__seed__',
    deliveredAt: null,
    timestamp: new Date(0).toISOString(),
  };
  widgetCtx.messageCtx.state.setPartial({ messages: [seed] });
};

/* ------------------------------------------------------ */
/*                         Tests                          */
/* ------------------------------------------------------ */

suite('hooks.onMessageReceived', () => {
  suite(
    'hooks.onMessageReceived — AI reply path (sendMessage response)',
    () => {
      test('fires with the AI message and current session', async () => {
        const aiMessageId = genUuid();
        const sessionId = genUuid();

        TestUtils.mock.ApiCaller.createSession(ApiCaller, {
          data: makeSessionDto({ id: sessionId }),
        });
        TestUtils.mock.ApiCaller.sendMessage(ApiCaller, {
          data: {
            success: true,
            autopilotResponse: {
              id: aiMessageId,
              type: 'text',
              value: { content: 'hello from AI', error: false },
              mightSolveUserIssue: false,
              completelyAndFullyCoveredUserIssue: false,
            },
          },
        });
        // Once createSession sets the session, the poller kicks in and the polling
        // response gets written back as the current session. Mock it to the same id
        // so the session in the hook ctx is the one we asserted on.
        TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
          data: { session: makeSessionDto({ id: sessionId }), history: [] },
        });

        const onMessageReceived =
          vi.fn<
            NonNullable<
              NonNullable<
                Parameters<typeof WidgetCtx.initialize>[0]['config']['hooks']
              >['onMessageReceived']
            >
          >();
        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '', hooks: { onMessageReceived } },
        });
        await TestUtils.sleep(50);

        await widgetCtx.messageCtx.sendMessage({ content: 'hi' });

        expect(onMessageReceived).toHaveBeenCalledTimes(1);
        const [callCtx] = onMessageReceived.mock.calls[0]!;
        expect(callCtx.message.id).toBe(aiMessageId);
        expect(callCtx.message.type).toBe('AI');
        expect((callCtx.message as WidgetAiMessage).data.message).toBe(
          'hello from AI',
        );
        expect(callCtx.session.id).toBe(sessionId);
      });

      test('does not fire for the optimistically-inserted user message', async () => {
        TestUtils.mock.ApiCaller.sendMessage(ApiCaller, {
          data: {
            success: true,
            autopilotResponse: {
              id: genUuid(),
              type: 'text',
              value: { content: 'reply', error: false },
              mightSolveUserIssue: false,
              completelyAndFullyCoveredUserIssue: false,
            },
          },
        });

        const onMessageReceived = vi.fn();
        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '', hooks: { onMessageReceived } },
        });
        await TestUtils.sleep(50);

        await widgetCtx.messageCtx.sendMessage({ content: 'hi' });

        // Sanity: the user message is in state...
        expect(
          widgetCtx.messageCtx.state
            .get()
            .messages.some((m) => m.type === 'USER'),
        ).toBe(true);
        // ...but the hook fired only for the AI reply (never the USER message).
        expect(onMessageReceived).toHaveBeenCalledTimes(1);
        expect(
          onMessageReceived.mock.calls.every(
            ([c]) => c.message.type !== 'USER',
          ),
        ).toBe(true);
      });

      test('does not fire when sendMessage responds with success: false', async () => {
        TestUtils.mock.ApiCaller.sendMessage(ApiCaller, {
          data: { success: false, error: { code: 'oops', message: 'boom' } },
        });

        const onMessageReceived = vi.fn();
        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '', hooks: { onMessageReceived } },
        });
        await TestUtils.sleep(50);

        await widgetCtx.messageCtx.sendMessage({ content: 'hi' });

        expect(onMessageReceived).not.toHaveBeenCalled();
      });

      test('does not throw when the hook itself is not configured', async () => {
        TestUtils.mock.ApiCaller.sendMessage(ApiCaller, {
          data: {
            success: true,
            autopilotResponse: {
              id: genUuid(),
              type: 'text',
              value: { content: 'reply', error: false },
              mightSolveUserIssue: false,
              completelyAndFullyCoveredUserIssue: false,
            },
          },
        });

        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '' /* no hooks */ },
        });
        await TestUtils.sleep(50);

        await expect(
          widgetCtx.messageCtx.sendMessage({ content: 'hi' }),
        ).resolves.not.toThrow();
      });
    },
  );

  suite('hooks.onMessageReceived — polling path', () => {
    test('fires once for an AI message returned by the poll', async () => {
      const sessionId = genUuid();
      const aiId = genUuid();
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [aiHistoryItem(aiId, 'polled ai text')],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);
      seedMessageStateAsAlreadyLoaded(widgetCtx);

      await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));

      expect(onMessageReceived).toHaveBeenCalledTimes(1);
      const [callCtx] = onMessageReceived.mock.calls[0]!;
      expect(callCtx.message.id).toBe(aiId);
      expect(callCtx.message.type).toBe('AI');
      expect((callCtx.message as WidgetAiMessage).data.message).toBe(
        'polled ai text',
      );
      expect(callCtx.session.id).toBe(sessionId);
    });

    test('fires for human-agent messages returned by the poll', async () => {
      const sessionId = genUuid();
      const agentId = genUuid();
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [agentHistoryItem(agentId, 'hi from human')],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);
      seedMessageStateAsAlreadyLoaded(widgetCtx);

      await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));

      expect(onMessageReceived).toHaveBeenCalledTimes(1);
      const [callCtx] = onMessageReceived.mock.calls[0]!;
      expect(callCtx.message.type).toBe('AGENT');
      expect((callCtx.message as WidgetAgentMessage).data.message).toBe(
        'hi from human',
      );
    });

    test('fires for system messages returned by the poll', async () => {
      const sessionId = genUuid();
      const csatId = genUuid();
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [csatRequestedHistoryItem(csatId)],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);
      seedMessageStateAsAlreadyLoaded(widgetCtx);

      await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));

      expect(onMessageReceived).toHaveBeenCalledTimes(1);
      const [callCtx] = onMessageReceived.mock.calls[0]!;
      expect(callCtx.message.type).toBe('SYSTEM');
      expect((callCtx.message as WidgetSystemMessageU).subtype).toBe(
        'csat_requested',
      );
    });

    test('does not fire for user messages returned by the poll', async () => {
      const sessionId = genUuid();
      const echoedUserId = genUuid();
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [userHistoryItem(echoedUserId, 'echoed user message')],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);
      seedMessageStateAsAlreadyLoaded(widgetCtx);

      await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));

      // The echoed user message is in state, but the hook never fires for USER.
      expect(
        widgetCtx.messageCtx.state
          .get()
          .messages.some((m) => m.id === echoedUserId),
      ).toBe(true);
      expect(onMessageReceived).not.toHaveBeenCalled();
    });

    test('fires for each distinct message in a multi-message poll response', async () => {
      const sessionId = genUuid();
      const aiId = genUuid();
      const agentId = genUuid();
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [
            aiHistoryItem(aiId, 'ai-1'),
            agentHistoryItem(agentId, 'agent-1'),
            userHistoryItem(genUuid(), 'user-1'),
          ],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);
      seedMessageStateAsAlreadyLoaded(widgetCtx);

      await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));

      // 2 = AI + AGENT. USER is skipped.
      expect(onMessageReceived).toHaveBeenCalledTimes(2);
      const ids = onMessageReceived.mock.calls.map(([c]) => c.message.id);
      expect(ids).toContain(aiId);
      expect(ids).toContain(agentId);
    });
  });

  suite('hooks.onMessageReceived — opening an existing session', () => {
    test('does NOT fire for the historical messages that flow in on initial load', async () => {
      const sessionId = genUuid();
      const historyIds = [genUuid(), genUuid(), genUuid()];
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [
            aiHistoryItem(historyIds[0]!, 'old 1'),
            agentHistoryItem(historyIds[1]!, 'old 2'),
            csatRequestedHistoryItem(historyIds[2]!),
          ],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);

      // Setting the session triggers the poller's initial fetch (messages.length === 0).
      await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));

      // History was loaded into state...
      expect(widgetCtx.messageCtx.state.get().messages.length).toBe(3);
      // ...but the hook was suppressed because this is initial history, not new arrivals.
      expect(onMessageReceived).not.toHaveBeenCalled();
    });

    test('subsequent polls still suppress already-loaded ids but fire for genuinely new ones', async () => {
      const sessionId = genUuid();
      const historyIds = [genUuid(), genUuid()];

      // First poll: full history.
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [
            aiHistoryItem(historyIds[0]!, 'old 1'),
            aiHistoryItem(historyIds[1]!, 'old 2'),
          ],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);
      await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));

      expect(onMessageReceived).not.toHaveBeenCalled();

      // Second poll: returns one of the same old ids + one genuinely new id.
      const newId = genUuid();
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [
            aiHistoryItem(historyIds[0]!, 'old 1 again'),
            aiHistoryItem(newId, 'genuinely new'),
          ],
        },
      });
      // `Poller.startPolling` no-ops while already polling, so reset and re-set
      // the session to drive a fresh poll cycle.
      await restartPoll(widgetCtx, makeSessionDto({ id: sessionId }));

      // The old id was filtered by the in-state dedup; the new id fires the hook once.
      expect(onMessageReceived).toHaveBeenCalledTimes(1);
      expect(onMessageReceived.mock.calls[0]![0].message.id).toBe(newId);
    });
  });

  suite('hooks.onMessageReceived — dedup across paths', () => {
    test('fires exactly once for a message id that arrives from both sendMessage and polling', async () => {
      const sessionId = genUuid();
      const sharedMessageId = genUuid();

      TestUtils.mock.ApiCaller.createSession(ApiCaller, {
        data: makeSessionDto({ id: sessionId }),
      });
      TestUtils.mock.ApiCaller.sendMessage(ApiCaller, {
        data: {
          success: true,
          autopilotResponse: {
            id: sharedMessageId,
            type: 'text',
            value: { content: 'shared reply', error: false },
            mightSolveUserIssue: false,
            completelyAndFullyCoveredUserIssue: false,
          },
        },
      });
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [aiHistoryItem(sharedMessageId, 'shared reply')],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);

      // sendMessage will create a session, which will also kick off the poller.
      // Both paths see the same id; the hook must fire exactly once.
      await widgetCtx.messageCtx.sendMessage({ content: 'hi' });
      await TestUtils.sleep(100);

      expect(onMessageReceived).toHaveBeenCalledTimes(1);
      expect(onMessageReceived.mock.calls[0]![0].message.id).toBe(
        sharedMessageId,
      );
    });
  });

  suite('hooks.onMessageReceived — reset behavior', () => {
    test('clears the dedup set on widgetCtx.resetChat() so the same id can fire again', async () => {
      const sessionId = genUuid();
      const sharedMessageId = genUuid();
      TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
        data: {
          session: makeSessionDto({ id: sessionId }),
          history: [aiHistoryItem(sharedMessageId, 'same id')],
        },
      });

      const onMessageReceived = vi.fn();
      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', hooks: { onMessageReceived } },
      });
      await TestUtils.sleep(50);

      // First poll: seed so it's treated as a poll-for-new-messages, not initial fetch.
      seedMessageStateAsAlreadyLoaded(widgetCtx);
      await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));
      expect(onMessageReceived).toHaveBeenCalledTimes(1);

      // Reset clears the dedup set + messages.
      widgetCtx.resetChat();

      // Re-seed so the next poll isn't treated as initial fetch, then drive it.
      // The id was cleared from the dedup set by reset, so the hook fires again.
      seedMessageStateAsAlreadyLoaded(widgetCtx);
      await restartPoll(widgetCtx, makeSessionDto({ id: sessionId }));
      expect(onMessageReceived).toHaveBeenCalledTimes(2);
    });
  });

  suite(
    'hooks.onMessageReceived — dispatchToOnMessageReceivedHook unit',
    () => {
      test('skips USER messages', async () => {
        const onMessageReceived = vi.fn();
        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '', hooks: { onMessageReceived } },
        });
        await TestUtils.sleep(50);
        widgetCtx.sessionCtx.sessionState.setPartial({
          session: makeSessionDto(),
        });

        const userMessage: WidgetMessageU = {
          id: genUuid(),
          type: 'USER',
          content: 'hi',
          deliveredAt: null,
          timestamp: null,
        };
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook(userMessage);

        expect(onMessageReceived).not.toHaveBeenCalled();
      });

      test('skips when no session is set', async () => {
        const onMessageReceived = vi.fn();
        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '', hooks: { onMessageReceived } },
        });
        await TestUtils.sleep(50);
        // No session set.

        const aiMessage: WidgetMessageU = {
          id: genUuid(),
          type: 'AI',
          component: 'bot_message',
          data: { message: 'orphan' },
          timestamp: null,
        };
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook(aiMessage);

        expect(onMessageReceived).not.toHaveBeenCalled();
      });

      test('dedupes by id within a single instance', async () => {
        const onMessageReceived = vi.fn();
        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '', hooks: { onMessageReceived } },
        });
        await TestUtils.sleep(50);
        widgetCtx.sessionCtx.sessionState.setPartial({
          session: makeSessionDto(),
        });

        const aiMessage: WidgetMessageU = {
          id: genUuid(),
          type: 'AI',
          component: 'bot_message',
          data: { message: 'a' },
          timestamp: null,
        };
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook(aiMessage);
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook(aiMessage);
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook(aiMessage);

        expect(onMessageReceived).toHaveBeenCalledTimes(1);
      });

      test('fires distinct ids independently', async () => {
        const onMessageReceived = vi.fn();
        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '', hooks: { onMessageReceived } },
        });
        await TestUtils.sleep(50);
        widgetCtx.sessionCtx.sessionState.setPartial({
          session: makeSessionDto(),
        });

        const make = (id: string): WidgetMessageU => ({
          id,
          type: 'AI',
          component: 'bot_message',
          data: { message: id },
          timestamp: null,
        });

        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook(make('a'));
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook(make('b'));
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook(make('c'));

        expect(onMessageReceived).toHaveBeenCalledTimes(3);
      });

      test('passes the current session in the ctx — even if it changes between calls', async () => {
        const onMessageReceived = vi.fn();
        const widgetCtx = await WidgetCtx.initialize({
          config: { token: '', hooks: { onMessageReceived } },
        });
        await TestUtils.sleep(50);

        const first = makeSessionDto();
        const second = makeSessionDto();

        widgetCtx.sessionCtx.sessionState.setPartial({ session: first });
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook({
          id: 'm1',
          type: 'AI',
          component: 'bot_message',
          data: { message: '1' },
          timestamp: null,
        });

        widgetCtx.sessionCtx.sessionState.setPartial({ session: second });
        widgetCtx.messageCtx.dispatchToOnMessageReceivedHook({
          id: 'm2',
          type: 'AI',
          component: 'bot_message',
          data: { message: '2' },
          timestamp: null,
        });

        expect(onMessageReceived).toHaveBeenCalledTimes(2);
        expect(onMessageReceived.mock.calls[0]![0].session.id).toBe(first.id);
        expect(onMessageReceived.mock.calls[1]![0].session.id).toBe(second.id);
      });
    },
  );
});
