// A page reload must not look like data loss: the conversation the visitor
// was in is remembered (a POINTER in the embedder's storage adapter — the
// messages live on the backend) and reopened when the sessions list lands.
// Off by default — the sessions list stays the home screen — and turned on
// per embed via `router.restoreLastSession`.
import { describe, expect, it, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { RouterCtx } from '../../context/router.ctx';
import { SessionCtx } from '../../context/session.ctx';
import { StorageCtx } from '../../context/storage.ctx';
import type { SessionDto } from '../../types/dtos';
import type { ExternalStorage } from '../../types/external-storage';
import type { WidgetConfig } from '../../types/widget-config';

const ACTIVE_SESSION_KEY = 'opencx-widget:org-token-tok:active-session';

function buildSession(overrides: Partial<SessionDto> = {}): SessionDto {
  return {
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
    ...overrides,
  };
}

function createStorage(seed?: Record<string, string>) {
  const values = new Map<string, string>(Object.entries(seed ?? {}));
  const storage: ExternalStorage = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
  return { storage, values };
}

function buildCtx({
  storage,
  restoreLastSession = true,
  config: configOverrides = {},
}: {
  storage: ExternalStorage;
  /**
   * The option under test; most cases exercise the opted-in behavior. Pass
   * `config: { router: {} }` to leave it out and hit the default.
   */
  restoreLastSession?: boolean;
  config?: Partial<WidgetConfig>;
}) {
  const config: WidgetConfig = {
    token: 'tok',
    user: { token: 'contact-token' },
    router: { restoreLastSession },
    ...configOverrides,
  };
  const api = new ApiCaller({ config });
  // The sessions poller stays in flight: these tests drive `sessionsState`
  // themselves, so a real (empty) fetch landing mid-test would route on its
  // own and hide what is being asserted.
  vi.spyOn(api, 'getSessions').mockReturnValue(
    new Promise(() => {}) as ReturnType<ApiCaller['getSessions']>,
  );
  const storageCtx = new StorageCtx({ storage, config });
  const contactCtx = new ContactCtx({ api, config, storageCtx });
  const sessionCtx = new SessionCtx({
    config,
    api,
    contactCtx,
    storageCtx,
    sessionsPollingIntervalSeconds: 3600,
  });
  const routerCtx = new RouterCtx({
    config,
    contactCtx,
    sessionCtx,
    resetChat: () => sessionCtx.sessionState.reset(),
  });
  return { sessionCtx, routerCtx };
}

/** Let the router's (async) storage read settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('restoring the last conversation', () => {
  it('remembers the open session the visitor is in', async () => {
    const { storage, values } = createStorage();
    const { sessionCtx } = buildCtx({ storage });
    const session = buildSession();
    await settle();

    sessionCtx.sessionState.setPartial({ session });
    await settle();
    expect(values.get(ACTIVE_SESSION_KEY)).toBe(session.id);

    // Starting a new chat forgets it; so would closing it.
    sessionCtx.sessionState.reset();
    await settle();
    expect(values.has(ACTIVE_SESSION_KEY)).toBe(false);

    sessionCtx.sessionState.setPartial({ session });
    await settle();
    sessionCtx.sessionState.setPartial({
      session: { ...session, isOpened: false },
    });
    await settle();
    expect(values.has(ACTIVE_SESSION_KEY)).toBe(false);
  });

  it('reopens it when the sessions list lands', async () => {
    const session = buildSession();
    const { storage } = createStorage({ [ACTIVE_SESSION_KEY]: session.id });
    const { sessionCtx, routerCtx } = buildCtx({ storage });
    await settle();

    sessionCtx.sessionsState.setPartial({
      data: [buildSession({ id: 'other-session' }), session],
      isInitialFetchLoading: false,
    });

    expect(sessionCtx.sessionState.get().session?.id).toBe(session.id);
    expect(routerCtx.state.get().screen).toBe('chat');
  });

  it('drops a pointer whose session is gone or closed, and routes normally', async () => {
    const closed = buildSession({ isOpened: false });
    const { storage, values } = createStorage({
      [ACTIVE_SESSION_KEY]: closed.id,
    });
    const { sessionCtx, routerCtx } = buildCtx({ storage });
    await settle();

    // Still loading: the pointer survives an empty first tick.
    sessionCtx.sessionsState.setPartial({
      data: [],
      isInitialFetchLoading: true,
    });
    expect(values.get(ACTIVE_SESSION_KEY)).toBe(closed.id);

    sessionCtx.sessionsState.setPartial({
      data: [closed],
      isInitialFetchLoading: false,
    });
    expect(sessionCtx.sessionState.get().session).toBeNull();
    expect(routerCtx.state.get().screen).toBe('sessions');
  });

  it('stays on the sessions list by default (option omitted)', async () => {
    const session = buildSession();
    const { storage } = createStorage({ [ACTIVE_SESSION_KEY]: session.id });
    const { sessionCtx, routerCtx } = buildCtx({
      storage,
      config: { router: {} },
    });
    await settle();

    sessionCtx.sessionsState.setPartial({
      data: [session],
      isInitialFetchLoading: false,
    });
    expect(sessionCtx.sessionState.get().session).toBeNull();
    expect(routerCtx.state.get().screen).toBe('sessions');
  });

  it('an explicit false opts out, an explicit true opts in', async () => {
    const session = buildSession();
    const optedOut = buildCtx({
      storage: createStorage({ [ACTIVE_SESSION_KEY]: session.id }).storage,
      restoreLastSession: false,
    });
    const optedIn = buildCtx({
      storage: createStorage({ [ACTIVE_SESSION_KEY]: session.id }).storage,
      restoreLastSession: true,
    });
    await settle();

    for (const ctx of [optedOut, optedIn]) {
      ctx.sessionCtx.sessionsState.setPartial({
        data: [session],
        isInitialFetchLoading: false,
      });
    }

    expect(optedOut.sessionCtx.sessionState.get().session).toBeNull();
    expect(optedIn.sessionCtx.sessionState.get().session?.id).toBe(session.id);
  });
});
