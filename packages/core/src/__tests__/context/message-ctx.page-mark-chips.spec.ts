// The user bubble shows "attached from screen" chips for the composer's
// page marks: the element name, the visitor's note, and a REFERENCE to the
// mark itself (the UI layer resolves the mark's thumbnail by object identity,
// so the sent bubble shows the same picture the composer did). All of it must
// survive every path that produces a USER message: the bot-chat optimistic
// append, the agent-chat optimistic append (buildQueuedUserMessage), and
// re-hydration from polled history rows. Malformed `page_marks` payloads must
// degrade to "no chips", never throw.
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
  customStatus: null,
};

function buildCtx(
  config: WidgetConfig = { token: 'tok' },
  sendsPageContext = true,
) {
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
    sendsPageContext,
  });
  return { messageCtx, sessionCtx, api, config };
}

function userMessages(messageCtx: MessageCtx) {
  return messageCtx.state
    .get()
    .messages.flatMap((m) => (m.type === 'USER' ? [m] : []));
}

suite('page-mark chips on the user bubble', () => {
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

  test('bot-chat send: marked elements land on the optimistic USER message', async () => {
    const { messageCtx } = buildCtx();
    const pageMarks = [
      {
        shape: 'box',
        elements: [{ name: 'button "Save"', selector: '#save' }],
      },
      {
        shape: 'circle',
        note: 'is this the right one?',
        elements: [{ name: 'link "Docs"', selector: 'nav a' }],
      },
    ];

    await messageCtx.sendMessage({
      content: 'what is this?',
      clientContext: { page_marks: pageMarks },
    });

    const [msg] = userMessages(messageCtx);
    expect(msg?.markedElements).toEqual([
      { name: 'button "Save"', mark: pageMarks[0] },
      {
        name: 'link "Docs"',
        note: 'is this the right one?',
        mark: pageMarks[1],
      },
    ]);
    // The very same object, not a copy: the thumbnail registry is keyed by
    // identity, and a clone would lose the picture the composer showed.
    expect(msg?.markedElements?.[0]?.mark).toBe(pageMarks[0]);
  });

  test('bot-chat send: a mark carrying its uploaded snapshot passes the URL to the chip', async () => {
    const { messageCtx } = buildCtx();
    const pageMarks = [
      {
        shape: 'box',
        note: 'call failed',
        snapshotUrl: 'https://storage.test/marks/1.jpg',
        elements: [{ name: 'div "Call summary"', selector: '#s' }],
      },
      // A non-string snapshot is visitor-controlled garbage: dropped, chip kept.
      {
        shape: 'box',
        snapshotUrl: 42,
        elements: [{ name: 'button "Retry"', selector: '#r' }],
      },
    ];

    await messageCtx.sendMessage({
      content: 'call failed',
      clientContext: { page_marks: pageMarks },
    });

    const [msg] = userMessages(messageCtx);
    expect(msg?.markedElements).toEqual([
      {
        name: 'div "Call summary"',
        note: 'call failed',
        snapshotUrl: 'https://storage.test/marks/1.jpg',
        mark: pageMarks[0],
      },
      { name: 'button "Retry"', mark: pageMarks[1] },
    ]);
  });

  test('bot-chat send without page marks: no chips field at all', async () => {
    const { messageCtx } = buildCtx();

    await messageCtx.sendMessage({ content: 'hello' });

    const [msg] = userMessages(messageCtx);
    expect(msg).toBeDefined();
    expect(msg?.markedElements).toBeUndefined();
  });

  test('page context off for this embed: marks are neither sent nor shown as chips', async () => {
    const { messageCtx } = buildCtx(
      { token: 'tok', features: { pageContext: false } },
      // `WidgetCtx.features.pageContext` — the narrowed answer.
      false,
    );

    await messageCtx.sendMessage({
      content: 'what is this?',
      clientContext: {
        page_marks: [
          {
            shape: 'box',
            elements: [{ name: 'button "Save"', selector: '#s' }],
          },
        ],
      },
    });

    const [msg] = userMessages(messageCtx);
    expect(msg).toBeDefined();
    expect(msg?.markedElements).toBeUndefined();
  });

  test('malformed page_marks degrade to no chips, never throw', async () => {
    const cases: unknown[] = [
      'not-an-array',
      42,
      { name: 'not wrapped in array' },
      [],
      [null, 'string-item', 7],
      [{ selector: '#no-name' }, { name: '' }, { name: 123 }],
    ];

    for (const page_marks of cases) {
      const { messageCtx } = buildCtx();
      await messageCtx.sendMessage({
        content: 'hi',
        clientContext: { page_marks },
      });
      const [msg] = userMessages(messageCtx);
      expect(msg, JSON.stringify(page_marks)).toBeDefined();
      expect(msg?.markedElements, JSON.stringify(page_marks)).toBeUndefined();
    }
  });

  test('mixed valid/invalid entries: only named entries become chips', async () => {
    const { messageCtx } = buildCtx();

    await messageCtx.sendMessage({
      content: 'hi',
      clientContext: {
        page_marks: [
          { shape: 'box', elements: [{ name: 'input "Email"' }] },
          { shape: 'box', elements: [{ selector: '#nameless' }] },
          { shape: 'box', elements: [] },
          null,
        ],
      },
    });

    const [msg] = userMessages(messageCtx);
    expect(msg?.markedElements).toEqual([
      {
        name: 'input "Email"',
        mark: { shape: 'box', elements: [{ name: 'input "Email"' }] },
      },
    ]);
  });

  test('v5 optimistic path (buildQueuedUserMessage) carries the chips too', () => {
    const { messageCtx } = buildCtx();

    const queued = messageCtx.buildQueuedUserMessage({
      content: 'what is this?',
      clientContext: {
        page_marks: [{ shape: 'box', elements: [{ name: 'button "Save"' }] }],
      },
    });

    expect(queued?.userMessage.markedElements).toEqual([
      {
        name: 'button "Save"',
        mark: { shape: 'box', elements: [{ name: 'button "Save"' }] },
      },
    ]);
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
      type: 'message',
      content: { text: 'what is this?' },
      sender: { kind: 'user' },
      sentAt: new Date().toISOString(),
      systemMessagePayload: { type: 'none' },
      // Backend field name; the polling boundary maps it to `markedElements`.
      pickedElements: [{ name: 'button "Save"' }],
    };
    const agentRow: MessageDto = {
      publicId: 'b1b1b1b1-0000-4000-8000-000000000002',
      type: 'message',
      content: { text: 'that is the save button' },
      sender: { kind: 'agent', name: 'Open' },
      sentAt: new Date().toISOString(),
      systemMessagePayload: { type: 'none' },
    };

    const mappedUser = polling.mapHistoryToMessage(userRow);
    expect(mappedUser?.type).toBe('USER');
    if (mappedUser?.type === 'USER') {
      expect(mappedUser.markedElements).toEqual([{ name: 'button "Save"' }]);
    }

    const mappedAgent = polling.mapHistoryToMessage(agentRow);
    expect(mappedAgent?.type).toBe('AGENT');
    if (mappedAgent?.type === 'AGENT') {
      expect('markedElements' in mappedAgent).toBe(false);
    }
  });

  test('history re-hydration: an AI row maps to a plain bot message — v2 history carries no turn steps', () => {
    // Steps for settled streamed turns come from `/v5/chat/:id/messages`
    // (`ui_parts`), never from polled v2 rows; nothing else may sneak them in.
    const { messageCtx, sessionCtx, api, config } = buildCtx();
    const polling = new ActiveSessionPollingCtx({
      api,
      config,
      sessionCtx,
      messageCtx,
      sessionPollingIntervalSeconds: 3600,
    });
    const aiRow: MessageDto = {
      publicId: 'b1b1b1b1-0000-4000-8000-000000000003',
      type: 'message',
      content: { text: 'here you go' },
      sender: { kind: 'ai' },
      sentAt: new Date().toISOString(),
      systemMessagePayload: { type: 'none' },
    };

    const mapped = polling.mapHistoryToMessage(aiRow);
    expect(mapped?.type).toBe('AI');
    expect(mapped).not.toHaveProperty('stepsBefore');
    expect(mapped).not.toHaveProperty('markedElements');
  });

  test('history row without markedElements maps to a USER message without chips', () => {
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
      type: 'message',
      content: { text: 'plain message' },
      sender: { kind: 'user' },
      sentAt: new Date().toISOString(),
      systemMessagePayload: { type: 'none' },
    };

    const mapped = polling.mapHistoryToMessage(row);
    expect(mapped?.type).toBe('USER');
    if (mapped?.type === 'USER') {
      expect(mapped.markedElements).toBeUndefined();
    }
  });
});
