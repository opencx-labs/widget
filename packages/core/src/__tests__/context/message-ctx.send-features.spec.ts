// Exercises the REAL MessageCtx → ApiCaller wire path (stubbed fetch) for the
// bot-chat blocking send: `config.features` rides the `chat/send` body as the
// snake_cased `features` field, and is ABSENT when the embedder set nothing —
// the org's own settings then stay in charge.
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { MessageCtx, resolveSendFeatures } from '../../context/message.ctx';
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
  return new MessageCtx({
    config,
    api,
    sessionCtx,
    contactCtx,
    streaming: false,
    sendsPageContext,
  });
}

suite('resolveSendFeatures', () => {
  test('maps camelCase config to the snake_cased wire field', () => {
    expect(
      resolveSendFeatures({
        token: 't',
        features: { preamble: false, inlineUi: false },
      }),
    ).toEqual({ preamble: false, inline_ui: false });
    expect(
      resolveSendFeatures({ token: 't', features: { inlineUi: true } }),
    ).toEqual({ inline_ui: true });
  });

  test('forwards page_context and client_tools exactly like preamble/inline_ui', () => {
    expect(
      resolveSendFeatures({
        token: 't',
        features: { pageContext: false, clientTools: false },
      }),
    ).toEqual({ page_context: false, client_tools: false });
    expect(
      resolveSendFeatures({ token: 't', features: { clientTools: true } }),
    ).toEqual({ client_tools: true });
    // `dictation` is composer-only: it never rides the send body.
    expect(
      resolveSendFeatures({ token: 't', features: { dictation: false } }),
    ).toBeUndefined();
  });

  test('is undefined when nothing is set, so the body stays unchanged', () => {
    expect(resolveSendFeatures({ token: 't' })).toBeUndefined();
    expect(resolveSendFeatures({ token: 't', features: {} })).toBeUndefined();
    expect(
      resolveSendFeatures({
        token: 't',
        features: { preamble: undefined, inlineUi: undefined },
      }),
    ).toBeUndefined();
  });
});

suite('MessageCtx bot-chat send — features on the wire', () => {
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

  const lastSendBody = (): Record<string, unknown> => {
    const request = requests.find((r) => r.url.includes('/chat/send'));
    const parsed: unknown = JSON.parse(request?.body ?? '{}');
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('chat/send body is not an object');
    }
    return Object.fromEntries(Object.entries(parsed));
  };

  test('sends `features` snake_cased when configured', async () => {
    const messageCtx = buildCtx({
      token: 'tok',
      features: { preamble: false, inlineUi: false },
    });
    await messageCtx.sendMessage({ content: 'hello' });

    expect(lastSendBody().features).toEqual({
      preamble: false,
      inline_ui: false,
    });
  });

  test('omits `features` entirely when the option is not set', async () => {
    const messageCtx = buildCtx({ token: 'tok' });
    await messageCtx.sendMessage({ content: 'hello' });

    expect(lastSendBody()).not.toHaveProperty('features');
  });

  test('features.pageContext=false → page_context=false on the wire; the widget adds no page marks but the host context still rides', async () => {
    const messageCtx = buildCtx(
      {
        token: 'tok',
        context: { page: { url: '/inbox' }, tenant: 'acme' },
        features: { pageContext: false },
      },
      // `WidgetCtx.features.pageContext` is the narrowed answer.
      false,
    );
    await messageCtx.sendMessage({
      content: 'hello',
      clientContext: { page_marks: [{ elements: [{ name: 'btn' }] }] },
    });

    const body = lastSendBody();
    expect(body.features).toEqual({ page_context: false });
    expect(body.clientContext).toEqual({
      page: { url: '/inbox' },
      tenant: 'acme',
    });
    expect(JSON.stringify(body)).not.toContain('page_marks');
  });

  test('org page_context off → the host context still rides, exactly as in v4', async () => {
    const messageCtx = buildCtx(
      { token: 'tok', context: { page: { url: '/inbox' } } },
      false,
    );
    await messageCtx.sendMessage({ content: 'hello' });

    const body = lastSendBody();
    expect(body.clientContext).toEqual({ page: { url: '/inbox' } });
    expect(body).not.toHaveProperty('features');
  });

  test('page context on → the widget page marks merge over the host context', async () => {
    const messageCtx = buildCtx(
      { token: 'tok', context: { page: { url: '/inbox' } } },
      true,
    );
    await messageCtx.sendMessage({
      content: 'hello',
      clientContext: { page_marks: [{ elements: [{ name: 'btn' }] }] },
    });

    expect(lastSendBody().clientContext).toEqual({
      page: { url: '/inbox' },
      page_marks: [{ elements: [{ name: 'btn' }] }],
    });
  });

  test('features.clientTools=false → client_tools=false on the wire', async () => {
    const messageCtx = buildCtx({
      token: 'tok',
      features: { clientTools: false },
    });
    await messageCtx.sendMessage({ content: 'hello' });

    expect(lastSendBody().features).toEqual({ client_tools: false });
  });
});
