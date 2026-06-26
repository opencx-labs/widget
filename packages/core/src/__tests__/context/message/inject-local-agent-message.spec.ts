import '../../api-caller.mock';

import { ApiCaller } from '../../../api/api-caller';
import { WidgetCtx } from '../../../context/widget.ctx';
import type { MessageDto, SessionDto } from '../../../types/dtos';
import type { WidgetAiMessage, WidgetMessageU } from '../../../types/messages';
import { genUuid } from '../../../utils/uuid';
import { TestUtils } from '../../test-utils';

/* ------------------------------------------------------ */
/*                        Helpers                         */
/* ------------------------------------------------------ */

const init = async (
  config: Parameters<typeof WidgetCtx.initialize>[0]['config'] = { token: '' },
) => {
  const widgetCtx = await WidgetCtx.initialize({ config });
  await TestUtils.sleep(20);
  return widgetCtx;
};

const makeSessionDto = (overrides: Partial<SessionDto> = {}): SessionDto => ({
  id: genUuid(),
  ticketNumber: 1,
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
  ...overrides,
});

const aiHistoryItem = (id = genUuid(), text = 'ai-text'): MessageDto => ({
  type: 'message',
  publicId: id,
  content: { text },
  sender: { kind: 'ai', name: null, avatar: null },
  sentAt: new Date().toISOString(),
  attachments: null,
  actionCalls: null,
  systemMessagePayload: { type: 'none' },
});

/** Sets the session so `ActiveSessionPollingCtx` starts and fires immediately. */
const triggerPoll = async (widgetCtx: WidgetCtx, session: SessionDto) => {
  widgetCtx.sessionCtx.sessionState.setPartial({ session });
  await TestUtils.sleep(50);
};

const messagesOf = (widgetCtx: WidgetCtx): WidgetMessageU[] =>
  widgetCtx.messageCtx.state.get().messages;

/* ------------------------------------------------------ */
/*                         Tests                          */
/* ------------------------------------------------------ */

suite('messageCtx.injectLocalAgentMessage', () => {
  test('appends a correctly-shaped AI bot_message bubble', async () => {
    const widgetCtx = await init();
    widgetCtx.messageCtx.injectLocalAgentMessage(
      'Onboarding takes ~2 minutes.',
    );

    const messages = messagesOf(widgetCtx);
    expect(messages).toHaveLength(1);
    const msg = messages[0] as WidgetAiMessage;
    expect(msg.type).toBe('AI');
    expect(msg.component).toBe('bot_message');
    expect(msg.data.message).toBe('Onboarding takes ~2 minutes.');
    expect(typeof msg.id).toBe('string');
    expect(msg.id.length).toBeGreaterThan(0);
    expect(typeof msg.timestamp).toBe('string');
  });

  test('uses config.bot for the agent identity when provided', async () => {
    const widgetCtx = await init({
      token: '',
      bot: { name: 'Volt', avatarUrl: null },
    });
    widgetCtx.messageCtx.injectLocalAgentMessage('hi');
    const msg = messagesOf(widgetCtx)[0] as WidgetAiMessage;
    expect(msg.agent?.name).toBe('Volt');
    expect(msg.agent?.isAi).toBe(true);
  });

  test('trims the message text', async () => {
    const widgetCtx = await init();
    widgetCtx.messageCtx.injectLocalAgentMessage('  hello  ');
    expect((messagesOf(widgetCtx)[0] as WidgetAiMessage).data.message).toBe(
      'hello',
    );
  });

  test('no-ops on empty or whitespace-only input', async () => {
    const widgetCtx = await init();
    widgetCtx.messageCtx.injectLocalAgentMessage('');
    widgetCtx.messageCtx.injectLocalAgentMessage('   ');
    expect(messagesOf(widgetCtx)).toHaveLength(0);
  });

  test('does NOT call the API (purely client-side)', async () => {
    const widgetCtx = await init();
    widgetCtx.messageCtx.injectLocalAgentMessage('canned');
    expect(ApiCaller.prototype.sendMessage).not.toHaveBeenCalled();
  });

  test('appends after existing messages and preserves order across injects', async () => {
    const widgetCtx = await init();
    widgetCtx.messageCtx.state.setPartial({
      messages: [
        {
          id: 'u1',
          type: 'USER',
          content: 'q',
          deliveredAt: null,
          timestamp: null,
        },
      ],
    });
    widgetCtx.messageCtx.injectLocalAgentMessage('first');
    widgetCtx.messageCtx.injectLocalAgentMessage('second');

    const msgs = messagesOf(widgetCtx);
    expect(msgs.map((m) => m.type)).toEqual(['USER', 'AI', 'AI']);
    expect((msgs[1] as WidgetAiMessage).data.message).toBe('first');
    expect((msgs[2] as WidgetAiMessage).data.message).toBe('second');
  });

  test('assigns a unique id to each injected bubble', async () => {
    const widgetCtx = await init();
    widgetCtx.messageCtx.injectLocalAgentMessage('a');
    widgetCtx.messageCtx.injectLocalAgentMessage('b');
    const [m1, m2] = messagesOf(widgetCtx);
    expect(m1!.id).not.toBe(m2!.id);
  });

  test('survives a polling cycle (poller merges by id, never replaces)', async () => {
    const widgetCtx = await init();
    const sessionId = genUuid();
    const polledAiId = genUuid();
    TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
      data: {
        session: makeSessionDto({ id: sessionId }),
        history: [aiHistoryItem(polledAiId, 'from server')],
      },
    });

    widgetCtx.messageCtx.injectLocalAgentMessage('canned answer');
    const injectedId = messagesOf(widgetCtx)[0]!.id;

    await triggerPoll(widgetCtx, makeSessionDto({ id: sessionId }));

    const ids = messagesOf(widgetCtx).map((m) => m.id);
    expect(ids).toContain(injectedId); // injected bubble survived the poll
    expect(ids).toContain(polledAiId); // server message was appended alongside
  });

  test('is cleared by widgetCtx.resetChat()', async () => {
    const widgetCtx = await init();
    widgetCtx.messageCtx.injectLocalAgentMessage('canned');
    expect(messagesOf(widgetCtx)).toHaveLength(1);
    widgetCtx.resetChat();
    expect(messagesOf(widgetCtx)).toHaveLength(0);
  });
});
