// A reply carries the message it answers, so the visitor can see which of
// their questions is being picked up. Two rows produce one: a teammate's
// public reply, and the AI's own follow-up after it asked the team. Both come
// off the same backend field, so both must map — the AI branch silently
// dropping it is the regression this guards.
import { expect, suite, test } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ActiveSessionPollingCtx } from '../../context/active-session-polling.ctx';
import { ContactCtx } from '../../context/contact.ctx';
import { MessageCtx } from '../../context/message.ctx';
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
  assignee: { kind: 'ai', name: null, avatarUrl: null },
  channel: 'web',
  isVerified: false,
  lastMessage: null,
  modeId: null,
  latestStateCheckpointPayload: null,
  sessionAttributes: {},
  customStatus: null,
};

function buildPolling(config: WidgetConfig = { token: 'tok' }) {
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
  return new ActiveSessionPollingCtx({
    api,
    config,
    sessionCtx,
    messageCtx,
    sessionPollingIntervalSeconds: 3600,
  });
}

const QUOTED_ID = 'b1b1b1b1-0000-4000-8000-0000000000ff';

function row(
  overrides: Partial<MessageDto> & Pick<MessageDto, 'sender'>,
): MessageDto {
  return {
    publicId: 'b1b1b1b1-0000-4000-8000-000000000001',
    type: 'message',
    content: { text: 'the fee is 1.9%' },
    sentAt: new Date().toISOString(),
    systemMessagePayload: { type: 'none' },
    ...overrides,
  };
}

suite('reply quote mapping', () => {
  test("a teammate's reply preserves the quoted visitor identity", () => {
    const mapped = buildPolling().mapHistoryToMessage(
      row({
        sender: { kind: 'agent', name: 'Human Agent' },
        replyTo: {
          publicId: QUOTED_ID,
          text: 'what is the cross-border fee?',
          sender: { kind: 'user' },
        },
      }),
    );

    expect(mapped?.type).toBe('AGENT');
    expect(mapped).toHaveProperty('replyTo', {
      id: QUOTED_ID,
      text: 'what is the cross-border fee?',
      sender: { kind: 'user' },
    });
  });

  test("the AI's follow-up carries the quote too, not just a teammate's reply", () => {
    const mapped = buildPolling().mapHistoryToMessage(
      row({
        sender: { kind: 'ai' },
        replyTo: {
          publicId: QUOTED_ID,
          text: 'what is the cross-border fee?',
          sender: { kind: 'user' },
        },
      }),
    );

    expect(mapped?.type).toBe('AI');
    expect(mapped).toHaveProperty('replyTo', {
      id: QUOTED_ID,
      text: 'what is the cross-border fee?',
      sender: { kind: 'user' },
    });
  });

  test.each<WidgetConfig>([
    { token: 'tok' },
    { token: 'tok', bot: { name: 'Payla Assistant', avatarUrl: null } },
  ])(
    'a quoted AI message keeps its identity independently of embed branding (%j)',
    (config) => {
      const mapped = buildPolling(config).mapHistoryToMessage(
        row({
          sender: { kind: 'agent', name: 'Human Agent' },
          replyTo: {
            publicId: QUOTED_ID,
            text: 'let me check that internally',
            sender: { kind: 'ai' },
          },
        }),
      );

      expect(mapped).toHaveProperty('replyTo', {
        id: QUOTED_ID,
        text: 'let me check that internally',
        sender: { kind: 'ai' },
      });
    },
  );

  test('a quoted teammate message keeps that teammate name', () => {
    const mapped = buildPolling().mapHistoryToMessage(
      row({
        sender: { kind: 'ai' },
        replyTo: {
          publicId: QUOTED_ID,
          text: 'on it',
          sender: { kind: 'agent', name: 'Human Agent' },
        },
      }),
    );

    expect(mapped).toHaveProperty('replyTo', {
      id: QUOTED_ID,
      text: 'on it',
      sender: { kind: 'agent', name: 'Human Agent' },
    });
  });

  test('rows without a quote carry no replyTo key at all', () => {
    const polling = buildPolling();

    // Positive control on the same shape: only `replyTo` differs between the
    // two rows, so an empty assertion here cannot pass for the wrong reason.
    expect(
      polling.mapHistoryToMessage(
        row({
          sender: { kind: 'ai' },
          replyTo: {
            publicId: QUOTED_ID,
            text: 'q',
            sender: { kind: 'user' },
          },
        }),
      ),
    ).toHaveProperty('replyTo');

    expect(
      polling.mapHistoryToMessage(row({ sender: { kind: 'ai' } })),
    ).not.toHaveProperty('replyTo');
    expect(
      polling.mapHistoryToMessage(
        row({ sender: { kind: 'agent', name: 'Human Agent' } }),
      ),
    ).not.toHaveProperty('replyTo');
  });
});

test('restored user messages preserve the v4 deliveredAt field', () => {
  const sentAt = '2026-09-23T10:00:00.000Z';
  const mapped = buildPolling().mapHistoryToMessage(
    row({ sender: { kind: 'user' }, sentAt }),
  );
  expect(mapped).toMatchObject({
    type: 'USER',
    timestamp: sentAt,
    deliveredAt: sentAt,
  });
});
