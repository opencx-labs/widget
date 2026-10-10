import type { SessionDto } from '../types/dtos';
import type { WidgetConfig } from '../types/widget-config';
import { log } from '../utils/log';
import { PrimitiveState } from '../utils/PrimitiveState';
import type { SessionsState } from './session.ctx';

/** The one backend call this needs; `ApiCaller.markSessionRead` satisfies it. */
export type UnreadApi = {
  markSessionRead: (args: {
    sessionId: string;
  }) => Promise<{ data?: SessionDto }>;
};

export type UnreadState = {
  /** Sessions the backend flags as holding a reply the visitor has not looked at. */
  unreadSessionIds: string[];
  /** Unread sessions, not unread messages. */
  count: number;
};

/**
 * Pause before reporting a session again after a failed read. A poll that
 * returns the same row is not a state change, so nothing else would retry
 * while the visitor keeps looking at it.
 */
const READ_RETRY_DELAY_MS = 5_000;

/**
 * The launcher dot. The backend owns the read state: every session row
 * carries `unread`, and this reports which session is on screen so the
 * backend can clear it. Shared by every conversation runtime of a widget,
 * so companion tabs feed one count.
 */
export class UnreadCtx {
  state = new PrimitiveState<UnreadState>({ unreadSessionIds: [], count: 0 });

  private config: WidgetConfig;
  private api: UnreadApi;
  private sessionsState: PrimitiveState<SessionsState>;
  private setSessions: (sessions: SessionDto[]) => void;
  /** The session whose transcript is on screen right now, if any. */
  private viewingSessionId: string | null = null;
  /** Sessions with a read call in flight, so one reply is reported once. */
  private readsInFlight = new Set<string>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNotifiedCount: number | null = null;
  private subscriptions: Array<() => void> = [];
  private disposed = false;

  constructor({
    config,
    api,
    sessionsState,
    setSessions,
  }: {
    config: WidgetConfig;
    api: UnreadApi;
    sessionsState: PrimitiveState<SessionsState>;
    /** Merges the backend's answer to a read call into the shared list. */
    setSessions: (sessions: SessionDto[]) => void;
  }) {
    this.config = config;
    this.api = api;
    this.sessionsState = sessionsState;
    this.setSessions = setSessions;
    this.subscriptions.push(
      sessionsState.subscribe(({ data }) => this.evaluate(data)),
    );
  }

  dispose = () => {
    this.disposed = true;
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions = [];
    this.viewingSessionId = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  };

  /**
   * Which session the visitor is actually looking at: widget open, chat
   * screen with its transcript showing, tab visible. `null` otherwise.
   * Looking at a session is what clears its dot; opening the widget onto the
   * list does not.
   */
  setViewingSessionId = (sessionId: string | null) => {
    this.viewingSessionId = sessionId;
    this.evaluate(this.sessionsState.get().data);
  };

  private evaluate = (rows: SessionDto[]) => {
    const unreadSessionIds: string[] = [];
    for (const row of rows) {
      if (row.unread !== true) continue;
      if (row.id === this.viewingSessionId) {
        this.markViewedSessionRead(row.id);
        continue;
      }
      unreadSessionIds.push(row.id);
    }
    this.state.set({ unreadSessionIds, count: unreadSessionIds.length });
    this.notifyCount(unreadSessionIds.length);
  };

  private markViewedSessionRead = (sessionId: string) => {
    if (this.readsInFlight.has(sessionId)) return;
    this.readsInFlight.add(sessionId);
    let lookAgain = false;
    this.api
      .markSessionRead({ sessionId })
      .then(({ data }) => {
        if (!data || this.disposed) return;
        // A poll that landed meanwhile may carry a newer reply: keep that row
        // and report the session once more instead of hiding the reply.
        const current = this.sessionsState
          .get()
          .data.find((row) => row.id === data.id);
        if (current && isNewer(current, data)) lookAgain = true;
        else this.setSessions([data]);
      })
      .catch((error: unknown) => {
        log.warn('failed to mark the session read', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        this.scheduleRetry();
      })
      .finally(() => {
        this.readsInFlight.delete(sessionId);
        if (lookAgain && !this.disposed) {
          this.evaluate(this.sessionsState.get().data);
        }
      });
  };

  private scheduleRetry = () => {
    if (this.retryTimer || this.disposed) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.evaluate(this.sessionsState.get().data);
    }, READ_RETRY_DELAY_MS);
  };

  private notifyCount = (count: number) => {
    if (count === this.lastNotifiedCount) return;
    this.lastNotifiedCount = count;
    try {
      this.config.hooks?.onUnreadCountChange?.(count);
    } catch (hookError) {
      log.error('onUnreadCountChange hook failed', hookError);
    }
  };
}

function isNewer(row: SessionDto, than: SessionDto): boolean {
  return new Date(row.updatedAt).getTime() > new Date(than.updatedAt).getTime();
}
