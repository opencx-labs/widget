// Exercises the REAL MessageCtx → ApiCaller wire path (stubbed fetch) for the
// Bot-chat blocking send: per-message `clientContext` (the composer's picked
// elements) must merge OVER the config-level `context`, and a send without
// per-message context must keep sending the config context untouched.
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { MessageCtx } from '../../context/message.ctx';
import { SessionCtx } from '../../context/session.ctx';
import type { SessionDto } from '../../types/dtos';
import type { WidgetConfig } from '../../types/widget-config';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

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

function buildCtx(config: WidgetConfig, sendsPageContext = true) {
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
  return messageCtx;
}

suite('MessageCtx bot-chat send — clientContext wire merge', () => {
  let requests: Array<{ url: string; body: string | null }>;

  beforeEach(() => {
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        requests.push({
          url: request.url,
          body: request.method === 'POST' ? await request.text() : null,
        });
        return jsonResponse({ success: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sentBody(): Record<string, unknown> {
    const request = requests.find((r) => r.url.includes('send'));
    if (!request?.body) throw new Error('no send-message request captured');
    const parsed: unknown = JSON.parse(request.body);
    if (typeof parsed !== 'object' || parsed === null)
      throw new Error('bad body');
    return Object.fromEntries(Object.entries(parsed));
  }

  test('per-send clientContext merges OVER config.context (per-send wins collisions)', async () => {
    const messageCtx = buildCtx({
      token: 'tok',
      context: { plan: 'from-config', tenant: 'acme' },
    });
    const picked = [{ name: 'button "Save"', selector: '#save' }];

    await messageCtx.sendMessage({
      content: 'what is this button?',
      clientContext: { page_marks: picked, plan: 'from-send' },
    });

    expect(sentBody()['clientContext']).toEqual({
      tenant: 'acme',
      plan: 'from-send',
      page_marks: picked,
    });
  });

  test('a send without per-message context keeps the config context untouched', async () => {
    const messageCtx = buildCtx({
      token: 'tok',
      context: { plan: 'from-config' },
    });

    await messageCtx.sendMessage({ content: 'hello' });

    expect(sentBody()['clientContext']).toEqual({ plan: 'from-config' });
  });

  test('per-send context works with no config context at all', async () => {
    const messageCtx = buildCtx({ token: 'tok' });
    const picked = [
      { name: 'link "Docs"', selector: 'nav > a:nth-of-type(2)' },
    ];

    await messageCtx.sendMessage({
      content: 'where does this go?',
      clientContext: { page_marks: picked },
    });

    expect(sentBody()['clientContext']).toEqual({ page_marks: picked });
  });

  test('page context off: the host context still rides (v4 behavior), only the widget page marks are dropped', async () => {
    const messageCtx = buildCtx(
      { token: 'tok', context: { plan: 'from-config' } },
      false,
    );

    await messageCtx.sendMessage({
      content: 'hello',
      clientContext: { page_marks: [{ name: 'x' }] },
    });

    expect(sentBody()['clientContext']).toEqual({ plan: 'from-config' });
  });

  test('a function-form context resolves at send time', async () => {
    let url = '/first';
    const messageCtx = buildCtx({
      token: 'tok',
      context: () => ({ page: { url } }),
    });

    url = '/second';
    await messageCtx.sendMessage({ content: 'hello' });

    expect(sentBody()['clientContext']).toEqual({ page: { url: '/second' } });
  });
});
