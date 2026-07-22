// The user bubble shows "attached from screen" chips for the composer's
// picked elements. The names must survive every path that produces a USER
// message: the v1/v2 optimistic append, the v5 optimistic append
// (buildQueuedUserMessage), and re-hydration from polled history rows.
// Malformed `picked_elements` payloads must degrade to "no chips", never throw.
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
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
};

function buildCtx(config: WidgetConfig = { token: 'tok' }) {
  const api = new ApiCaller({ config });
  const contactCtx = new ContactCtx({ api, config });
  const sessionCtx = new SessionCtx({
    config,
    api,
    contactCtx,
    sessionsPollingIntervalSeconds: 3600,
  });
  sessionCtx.sessionState.setPartial({ session });
  const messageCtx = new MessageCtx({ config, api, sessionCtx, contactCtx });
  return { messageCtx, sessionCtx, api, config };
}

function userMessages(messageCtx: MessageCtx) {
  return messageCtx.state.get().messages.flatMap((m) => (m.type === 'USER' ? [m] : []));
}

suite('picked-element chips on the user bubble', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('v1/v2 send: picked element names land on the optimistic USER message', async () => {
    const { messageCtx } = buildCtx();

    await messageCtx.sendMessage({
      content: 'what is this?',
      clientContext: {
        picked_elements: [
          { name: 'button "Save"', selector: '#save', path: 'main > button' },
          { name: 'link "Docs"', selector: 'nav a' },
        ],
      },
    });

    const [msg] = userMessages(messageCtx);
    expect(msg?.pickedElements).toEqual([{ name: 'button "Save"' }, { name: 'link "Docs"' }]);
  });

  test('v1/v2 send without picked elements: no chips field at all', async () => {
    const { messageCtx } = buildCtx();

    await messageCtx.sendMessage({ content: 'hello' });

    const [msg] = userMessages(messageCtx);
    expect(msg).toBeDefined();
    expect(msg?.pickedElements).toBeUndefined();
  });

  test('malformed picked_elements degrade to no chips, never throw', async () => {
    const cases: unknown[] = [
      'not-an-array',
      42,
      { name: 'not wrapped in array' },
      [],
      [null, 'string-item', 7],
      [{ selector: '#no-name' }, { name: '' }, { name: 123 }],
    ];

    for (const picked_elements of cases) {
      const { messageCtx } = buildCtx();
      await messageCtx.sendMessage({
        content: 'hi',
        clientContext: { picked_elements },
      });
      const [msg] = userMessages(messageCtx);
      expect(msg, JSON.stringify(picked_elements)).toBeDefined();
      expect(msg?.pickedElements, JSON.stringify(picked_elements)).toBeUndefined();
    }
  });

  test('mixed valid/invalid entries: only named entries become chips', async () => {
    const { messageCtx } = buildCtx();

    await messageCtx.sendMessage({
      content: 'hi',
      clientContext: {
        picked_elements: [{ name: 'input "Email"' }, { selector: '#nameless' }, null],
      },
    });

    const [msg] = userMessages(messageCtx);
    expect(msg?.pickedElements).toEqual([{ name: 'input "Email"' }]);
  });

  test('v5 optimistic path (buildQueuedUserMessage) carries the chips too', () => {
    const { messageCtx } = buildCtx();

    const queued = messageCtx.buildQueuedUserMessage({
      content: 'what is this?',
      clientContext: { picked_elements: [{ name: 'button "Save"' }] },
    });

    expect(queued?.userMessage.pickedElements).toEqual([{ name: 'button "Save"' }]);
    expect(queued?.userMessage.pending).toBe(true);
  });

  test('history re-hydration: polled user rows keep their chips, agent rows never get them', () => {
    const { messageCtx, sessionCtx, api, config } = buildCtx();
    const polling = new ActiveSessionPollingCtx({
      api,
      config,
      sessionCtx,
      messageCtx,
      sessionPollingIntervalSeconds: 3600,
    });

    const userRow: MessageDto = {
      publicId: 'b1b1b1b1-0000-4000-8000-000000000001',
      type: 'MESSAGE',
      content: { text: 'what is this?' },
      sender: { kind: 'user' },
      sentAt: new Date().toISOString(),
      systemMessagePayload: null,
      pickedElements: [{ name: 'button "Save"' }],
    };
    const agentRow: MessageDto = {
      publicId: 'b1b1b1b1-0000-4000-8000-000000000002',
      type: 'MESSAGE',
      content: { text: 'that is the save button' },
      sender: { kind: 'agent', name: 'Open' },
      sentAt: new Date().toISOString(),
      systemMessagePayload: null,
    };

    const mappedUser = polling.mapHistoryToMessage(userRow);
    expect(mappedUser?.type).toBe('USER');
    if (mappedUser?.type === 'USER') {
      expect(mappedUser.pickedElements).toEqual([{ name: 'button "Save"' }]);
    }

    const mappedAgent = polling.mapHistoryToMessage(agentRow);
    expect(mappedAgent?.type).toBe('AGENT');
    if (mappedAgent?.type === 'AGENT') {
      expect('pickedElements' in mappedAgent).toBe(false);
    }
  });

  test('history row without pickedElements maps to a USER message without chips', () => {
    const { messageCtx, sessionCtx, api, config } = buildCtx();
    const polling = new ActiveSessionPollingCtx({
      api,
      config,
      sessionCtx,
      messageCtx,
      sessionPollingIntervalSeconds: 3600,
    });

    const row: MessageDto = {
      publicId: 'b1b1b1b1-0000-4000-8000-000000000003',
      type: 'MESSAGE',
      content: { text: 'plain message' },
      sender: { kind: 'user' },
      sentAt: new Date().toISOString(),
      systemMessagePayload: null,
    };

    const mapped = polling.mapHistoryToMessage(row);
    expect(mapped?.type).toBe('USER');
    if (mapped?.type === 'USER') {
      expect(mapped.pickedElements).toBeUndefined();
    }
  });
});
