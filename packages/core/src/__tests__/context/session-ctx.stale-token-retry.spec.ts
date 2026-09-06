// Real ApiCaller + stubbed fetch: a 401 on create-session means the stored
// contact token is dead. The widget mints a fresh unverified contact and
// retries the creation exactly once — never in a loop, never for a token the
// embedder supplied (`user.token`, which the widget cannot replace).
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { SessionCtx } from '../../context/session.ctx';
import type { WidgetConfig } from '../../types/widget-config';

type Route = { match: string; respond: () => Response };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const session = {
  id: 's-1',
  ticketNumber: 1,
  title: null,
  createdAt: '',
  updatedAt: '',
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

function buildCtx(config: WidgetConfig) {
  const api = new ApiCaller({ config });
  const contactCtx = new ContactCtx({ api, config });
  const sessionCtx = new SessionCtx({
    config,
    api,
    contactCtx,
    sessionsPollingIntervalSeconds: 3600,
  });
  return { sessionCtx, contactCtx };
}

suite('SessionCtx.createSession — stale contact token', () => {
  let calls: string[];
  let routes: Route[];

  beforeEach(() => {
    calls = [];
    routes = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        calls.push(new URL(request.url).pathname);
        const route = routes.find((r) => request.url.includes(r.match));
        return route ? route.respond() : json({});
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  test('a 401 mints a fresh contact and retries once', async () => {
    let createSessionAttempts = 0;
    routes.push(
      {
        match: 'create-session',
        respond: () =>
          ++createSessionAttempts === 1
            ? json({ message: 'unauthorized' }, 401)
            : json(session),
      },
      {
        match: 'create-unverified',
        respond: () => json({ token: 'fresh-jwt' }),
      },
    );
    const { sessionCtx, contactCtx } = buildCtx({ token: 'tok' });

    await expect(sessionCtx.createSession()).resolves.toEqual(session);
    expect(createSessionAttempts).toBe(2);
    expect(contactCtx.state.get().contact?.token).toBe('fresh-jwt');
    expect(sessionCtx.sessionState.get().isCreatingSession).toBe(false);
  });

  test('a second 401 is reported, not retried again', async () => {
    let createSessionAttempts = 0;
    routes.push(
      {
        match: 'create-session',
        respond: () => {
          createSessionAttempts += 1;
          return json({ message: 'unauthorized' }, 401);
        },
      },
      {
        match: 'create-unverified',
        respond: () => json({ token: 'fresh-jwt' }),
      },
    );
    const { sessionCtx } = buildCtx({ token: 'tok' });

    await expect(sessionCtx.createSession()).resolves.toBeNull();
    expect(createSessionAttempts).toBe(2);
    expect(sessionCtx.sessionState.get().isCreatingSession).toBe(false);
  });

  test('an embedder-supplied user token is never replaced', async () => {
    routes.push({
      match: 'create-session',
      respond: () => json({ message: 'unauthorized' }, 401),
    });
    const { sessionCtx } = buildCtx({
      token: 'tok',
      user: { token: 'verified-jwt' },
    });

    await expect(sessionCtx.createSession()).resolves.toBeNull();
    expect(calls.filter((p) => p.includes('create-unverified'))).toEqual([]);
    expect(calls.filter((p) => p.includes('create-session'))).toHaveLength(1);
  });
});
