import type { ApiCaller } from '../api/api-caller';
import type { Dto } from '../api/client';
import type { CreateSessionDto, SessionDto } from '../types/dtos';
import type { WidgetConfig } from '../types/widget-config';
import { Poller } from '../utils/Poller';
import { PrimitiveState } from '../utils/PrimitiveState';
import { runCatching } from '../utils/run-catching';
import type { ContactCtx } from './contact.ctx';
import type { StorageCtx } from './storage.ctx';
import { log } from '../utils/log';

type SessionState = {
  /**
   * The currently selected session.
   * Can be null if no session is selected, or if in chat screen and the session is not created yet.
   */
  session: SessionDto | null;
  isCreatingSession: boolean;
  isResolvingSession: boolean;
};
type SessionsState = {
  /** List of all user sessions */
  data: SessionDto[];
  /** A cursor to get the next page of sessions */
  cursor: string | undefined;
  /** Indicates if no more pages are left */
  isLastPage: boolean;
  /** Did fetch for the first time */
  didStartInitialFetch: boolean;
  isInitialFetchLoading: boolean;
};

export class SessionCtx {
  private config: WidgetConfig;
  private api: ApiCaller;
  private contactCtx: ContactCtx;
  private storageCtx?: StorageCtx;
  private sessionsPollingIntervalSeconds: number;
  private sessionsRefresher = new Poller();
  /** The session id currently written to storage (null = none written). */
  private persistedSessionId: string | null = null;
  private stopPersistingSession?: () => void;

  public sessionState = new PrimitiveState<SessionState>({
    session: null,
    isCreatingSession: false,
    isResolvingSession: false,
  });
  public sessionsState = new PrimitiveState<SessionsState>({
    data: [],
    cursor: undefined,
    isLastPage: false,
    didStartInitialFetch: false,
    /**
     * Initialize this as `true` so it always starts loading until the first fetch is done
     */
    isInitialFetchLoading: true,
  });

  constructor({
    config,
    api,
    contactCtx,
    storageCtx,
    sessionsPollingIntervalSeconds,
    sharedSessions,
  }: {
    config: WidgetConfig;
    api: ApiCaller;
    contactCtx: ContactCtx;
    storageCtx?: StorageCtx;
    sessionsPollingIntervalSeconds: number;
    sharedSessions?: PrimitiveState<SessionsState>;
  }) {
    this.config = config;
    this.api = api;
    this.contactCtx = contactCtx;
    this.storageCtx = storageCtx;
    this.sessionsPollingIntervalSeconds = sessionsPollingIntervalSeconds;

    if (sharedSessions) this.sessionsState = sharedSessions;
    else this.registerSessionsRefresherWrapper();
    this.registerActiveSessionPersistence();
  }

  /**
   * Remember which conversation the visitor is in, so a page reload can put
   * them back into it (`RouterCtx` does the restoring). Only OPEN sessions are
   * remembered — a closed one would reopen as a dead transcript — and the
   * pointer is dropped the moment the visitor leaves for a new chat.
   *
   * The boot value is deliberately NOT written: `subscribe` fires on changes
   * only, and clearing on a null we never set would wipe the pointer the
   * restore is about to read.
   */
  private registerActiveSessionPersistence = () => {
    const storageCtx = this.storageCtx;
    if (!storageCtx) return;
    this.stopPersistingSession = this.sessionState.subscribe(
      this.persistSession,
    );
  };

  /** Persistence belongs to the selected conversation, never a background response. */
  trackActiveSession = (active: SessionCtx) => {
    this.stopPersistingSession?.();
    this.stopPersistingSession = active.sessionState.subscribe(
      this.persistSession,
    );
    this.persistSession(active.sessionState.get());
  };

  private persistSession = ({ session }: SessionState) => {
    const storageCtx = this.storageCtx;
    if (!storageCtx) return;
    const openSessionId = session?.isOpened ? session.id : null;
    if (openSessionId === this.persistedSessionId) return;
    // Nothing to forget until something was remembered.
    if (!openSessionId && this.persistedSessionId === null) return;
    this.persistedSessionId = openSessionId;
    const write = openSessionId
      ? storageCtx.setActiveSessionId(openSessionId)
      : storageCtx.clearActiveSessionId();
    // Storage is an embedder-provided adapter; a broken one must never take
    // the conversation down with it.
    void write.catch((error: unknown) => {
      log.warn('failed to persist the active session', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  /** The conversation the visitor was last in, from a previous page load. */
  getLastActiveSessionId = async (): Promise<string | null> => {
    if (!this.storageCtx) return null;
    try {
      return await this.storageCtx.getActiveSessionId();
    } catch {
      return null;
    }
  };

  /** Clears the session and stops polling */
  reset = async () => {
    // Reset the session only, leave sessions as-is
    this.sessionState.reset();
  };

  private registerSessionsRefresherWrapper = () => {
    if (
      // If the widget config was initially provided with a contact token, no state change would be triggered, so we just fetch
      this.contactCtx.state.get().contact?.token &&
      !this.sessionsState.get().didStartInitialFetch
    ) {
      this.registerSessionsRefresher();
    } else {
      // In other cases where auto authenticate is fired, the token would be eventually set in state, so we wait for it
      this.contactCtx.state.subscribe(({ contact }) => {
        if (contact?.token && !this.sessionsState.get().didStartInitialFetch) {
          this.registerSessionsRefresher();
        }
      });
    }
  };

  private registerSessionsRefresher = () => {
    this.sessionsRefresher.startPolling(async () => {
      if (this.sessionsState.get().didStartInitialFetch === false) {
        this.sessionsState.setPartial({ didStartInitialFetch: true });
      }

      await this.refreshSessions();

      if (this.sessionsState.get().isInitialFetchLoading === true) {
        this.sessionsState.setPartial({ isInitialFetchLoading: false });
      }
    }, this.sessionsPollingIntervalSeconds * 1000);
  };

  private getParsedCustomData = (): CreateSessionDto['customData'] => {
    return Object.fromEntries<
      NonNullable<CreateSessionDto['customData']>[string]
    >(
      Object.entries(this.config.sessionCustomData || {}).map(
        ([key, value]) => {
          if (typeof value === 'string') return [key, value];
          if (typeof value === 'boolean') return [key, value];
          if (typeof value === 'number') return [key, value];
          // TODO maybe better to unnest instead of stringify-ing
          return [key, runCatching(() => JSON.stringify(value))?.data || ''];
        },
      ),
    );
  };

  createSession = async (): Promise<SessionDto | null> => {
    this.sessionState.setPartial({ session: null, isCreatingSession: true });
    try {
      const first = await this.requestSession();
      if (first.session) return first.session;

      // Self-heal a stale contact token (401): drop it, mint a fresh contact,
      // then retry exactly once.
      if (
        first.status === 401 &&
        (await this.contactCtx.recoverFromStaleToken())
      ) {
        const retry = await this.requestSession();
        if (retry.session) return retry.session;
        log.error('failed to create session', retry.error);
        return null;
      }

      log.error('failed to create session', first.error);
      return null;
    } catch (error) {
      log.error('failed to create session', error);
      return null;
    } finally {
      this.sessionState.setPartial({ isCreatingSession: false });
    }
  };

  /** One create-session request; on success the session is stored and the hook fires. */
  private requestSession = async (): Promise<{
    session: SessionDto | null;
    status: number | undefined;
    error: unknown;
  }> => {
    const externalId = this.contactCtx.state.get().contact?.externalId;
    const customData: CreateSessionDto['customData'] = {
      ...this.getParsedCustomData(),
      ...(externalId ? { external_id: externalId } : {}),
    };
    const {
      data: session,
      error,
      response,
    } = await this.api.createSession({
      customData: Object.keys(customData).length > 0 ? customData : undefined,
    });
    if (!session) return { session: null, status: response?.status, error };

    this.sessionState.setPartial({ session });
    try {
      this.config.hooks?.onSessionCreated?.({ session });
    } catch (hookError) {
      log.error('onSessionCreated hook failed', hookError);
    }
    return { session, status: response.status, error: undefined };
  };

  loadMoreSessions = async () => {
    if (this.sessionsState.get().isLastPage) return;

    const { data } = await this.getSessions({
      cursor: this.sessionsState.get().cursor,
    });

    if (data) {
      const allSessions = [...this.sessionsState.get().data, ...data.items];
      // TODO sort by updated at
      const deduped = allSessions.filter(
        (s, i, self) => i === self.findIndex((_s) => s.id === _s.id),
      );

      this.sessionsState.setPartial({
        data: deduped,
        cursor: data.next || undefined,
        isLastPage: data.next === null,
      });
    }
  };

  private getSessions = async ({ cursor }: { cursor: string | undefined }) => {
    if (!this.contactCtx.state.get().contact?.token) return { data: null };

    const externalId = this.contactCtx.state.get().contact?.externalId;
    return await this.api.getSessions({
      cursor,
      filters: externalId
        ? {
            external_id: externalId,
          }
        : {},
    });
  };

  setSessions = (data: SessionDto[]) => {
    const sessions = [...data, ...this.sessionsState.get().data].filter(
      (s, i, self) => i === self.findIndex((_s) => s.id === _s.id),
    );
    this.sessionsState.setPartial({ data: sessions });
  };

  refreshSessions = async () => {
    // Get the first page only (pass no `cursor`)
    const { data } = await this.getSessions({ cursor: undefined });
    if (!data) return;
    this.setSessions(data.items);
  };

  resolveSession = async () => {
    const currentSession = this.sessionState.get().session;
    if (!currentSession || !currentSession.isOpened) {
      return { success: false, error: 'Session is not opened' } as const;
    }

    this.sessionState.setPartial({ isResolvingSession: true });

    const { data: session, error } = await this.api.resolveSession({
      session_id: currentSession.id,
    });

    if (session) {
      this.sessionState.setPartial({ session, isResolvingSession: false });
      return { success: true, data: session } as const;
    }

    this.sessionState.setPartial({ isResolvingSession: false });
    return { success: false, error } as const;
  };

  createStateCheckpoint = async (
    payload: Dto['WidgetCreateStateCheckpointInputDto']['payload'],
  ) => {
    const session_id = this.sessionState.get().session?.id;
    if (!session_id) return;

    const { data } = await this.api.createStateCheckpoint({
      session_id,
      payload,
    });

    if (data?.success) return { success: true } as const;

    return { success: false } as const;
  };
}
