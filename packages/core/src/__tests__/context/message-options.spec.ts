// A teammate's macro can carry options the visitor taps. The options ride the
// agent row from history, the tap goes back as `option_reply`, and the tapped
// option renders as picked at once — polls never rewrite a message they
// already delivered, so nothing else would mark it.
import { expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ActiveSessionPollingCtx } from '../../context/active-session-polling.ctx';
import { ContactCtx } from '../../context/contact.ctx';
import { buildSendMessageBody, MessageCtx } from '../../context/message.ctx';
import { SessionCtx } from '../../context/session.ctx';
import type { MessageDto, SessionDto } from '../../types/dtos';
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

const TAPPED_ID = 'b1b1b1b1-0000-4000-8000-000000000001';
const OTHER_ID = 'b1b1b1b1-0000-4000-8000-000000000002';

const OPTIONS = {
  options: [
    { id: 'opt-yes', label: 'Yes' },
    { id: 'opt-no', label: 'No' },
  ],
  pickedOptionId: null,
};

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
  return { api, messageCtx, polling };
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

suite('macro options on the widget', () => {
  test('an agent row carries its options; a row without them gets no key', () => {
    const { polling } = build();

    const withOptions = polling.mapHistoryToMessage(
      agentRow({ messageOptions: OPTIONS }),
    );
    const plain = polling.mapHistoryToMessage(agentRow());

    expect(withOptions).toMatchObject({
      type: 'AGENT',
      messageOptions: OPTIONS,
    });
    expect(plain).toMatchObject({
      type: 'AGENT',
      data: { message: 'Can we access your account?' },
    });
    expect(plain).not.toHaveProperty('messageOptions');
  });

  test('a tap is sent as option_reply; a typed message sends none', () => {
    const base = {
      config: { token: 'tok' },
      uuid: 'c1c1c1c1-0000-4000-8000-000000000001',
      sessionId: session.id,
      content: 'Yes',
      initialMessages: [],
      sendsPageContext: false,
    };

    const tap = buildSendMessageBody({
      ...base,
      input: {
        content: 'Yes',
        optionReply: { messageId: 'b1b1', optionId: 'opt-yes' },
      },
    });
    const typed = buildSendMessageBody({ ...base, input: { content: 'Yes' } });

    expect(tap.option_reply).toEqual({
      message_id: 'b1b1',
      option_id: 'opt-yes',
    });
    expect(typed.content).toBe('Yes');
    expect(typed.option_reply).toBeUndefined();
  });

  function withTwoOptionMessages() {
    const ctx = build();
    const tapped = ctx.polling.mapHistoryToMessage(
      agentRow({ messageOptions: OPTIONS }),
    );
    const other = ctx.polling.mapHistoryToMessage(
      agentRow({ publicId: OTHER_ID, messageOptions: OPTIONS }),
    );
    if (!tapped || !other) throw new Error('rows did not map');
    ctx.messageCtx.state.setPartial({ messages: [tapped, other] });
    const pickedOf = (id: string) => {
      const message = ctx.messageCtx.state
        .get()
        .messages.find((m) => m.id === id);
      return message?.type === 'AGENT'
        ? message.messageOptions?.pickedOptionId
        : undefined;
    };
    const tap = {
      content: 'Yes',
      optionReply: { messageId: TAPPED_ID, optionId: 'opt-yes' },
    };
    return { ...ctx, pickedOf, tap };
  }

  test('an accepted tap marks only its option picked while the reply is pending', async () => {
    const { api, messageCtx, pickedOf, tap } = withTwoOptionMessages();
    const sent = vi
      .spyOn(api, 'sendMessage')
      .mockReturnValue(new Promise(() => {}));

    void messageCtx.sendMessage(tap);
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));

    expect(pickedOf(TAPPED_ID)).toBe('opt-yes');
    expect(pickedOf(OTHER_ID)).toBeNull();
  });

  test('a tap the engine never sends leaves the options tappable', async () => {
    const { api, messageCtx, pickedOf, tap } = withTwoOptionMessages();
    const sent = vi.spyOn(api, 'sendMessage');
    messageCtx.state.setPartial({ isSendingMessageToAI: true });

    await messageCtx.sendMessage(tap);

    expect(sent).not.toHaveBeenCalled();
    expect(pickedOf(TAPPED_ID)).toBeNull();
  });

  test('a tap whose send fails is released so the visitor can tap again', async () => {
    const { api, messageCtx, pickedOf, tap } = withTwoOptionMessages();
    const sent = vi
      .spyOn(api, 'sendMessage')
      .mockRejectedValue(new Error('network down'));

    await messageCtx.sendMessage(tap);

    expect(sent).toHaveBeenCalledTimes(1);
    expect(pickedOf(TAPPED_ID)).toBeNull();
  });

  test('a failed tap keeps a different pick confirmed while it was in flight', async () => {
    const { api, messageCtx, pickedOf, tap } = withTwoOptionMessages();
    let failSend: (error: Error) => void = () => {};
    const sent = vi.spyOn(api, 'sendMessage').mockReturnValue(
      new Promise((_resolve, reject) => {
        failSend = reject;
      }),
    );

    const sending = messageCtx.sendMessage(tap);
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    expect(pickedOf(TAPPED_ID)).toBe('opt-yes');
    messageCtx.setMessageOptionPick(TAPPED_ID, 'opt-no');
    failSend(new Error('network down'));
    await sending;

    expect(pickedOf(TAPPED_ID)).toBe('opt-no');
  });

  test('a poll applies a pick made in another tab and never clears a local one', async () => {
    const { api, polling, messageCtx, pickedOf } = withTwoOptionMessages();
    messageCtx.setMessageOptionPick(OTHER_ID, 'opt-no');
    vi.spyOn(api, 'pollSessionAndHistory').mockResolvedValue({
      data: {
        session,
        history: [
          agentRow({
            messageOptions: { ...OPTIONS, pickedOptionId: 'opt-yes' },
          }),
          agentRow({ publicId: OTHER_ID, messageOptions: OPTIONS }),
        ],
      },
      error: undefined,
      response: new Response(),
    });

    await polling.fetchSessionAndHistory({
      sessionId: session.id,
      abortSignal: new AbortController().signal,
    });

    expect(pickedOf(TAPPED_ID)).toBe('opt-yes');
    expect(pickedOf(OTHER_ID)).toBe('opt-no');
  });
});
