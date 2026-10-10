import type { SessionDto } from '../types/dtos';
import type { WidgetConfig } from '../types/widget-config';
import { log } from '../utils/log';
import { PrimitiveState } from '../utils/PrimitiveState';
import { playUnreadSound, primeUnreadSound } from '../utils/unread-sound';
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

/** A burst of replies chimes once. */
const MIN_CHIME_GAP_MS = 2_000;

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
  /**
   * Sessions this page has already reported as seen. A session without a
   * backend read marker is never flagged, so the first look is reported
   * even when nothing is unread; that is what starts tracking it.
   */
  private reportedSessionIds = new Set<string>();
  /** How each session looked at the last evaluation, to spot new replies. */
  private lastSeen = new Map<string, { unread: boolean; updatedAt: number }>();
  /**
   * The newest `updatedAt` of the list as it loaded. A session that shows up
   * later counts as news only if it moved after that: a later page of the
   * list brings older sessions, not new replies. `null` until the list loads.
   */
  private loadedUpTo: number | null = null;
  private lastChimeAt = Number.NEGATIVE_INFINITY;
  private playSound: (source: string | undefined) => void;

  constructor({
    config,
    api,
    sessionsState,
    setSessions,
    playSound = playUnreadSound,
  }: {
    config: WidgetConfig;
    api: UnreadApi;
    sessionsState: PrimitiveState<SessionsState>;
    /** Merges the backend's answer to a read call into the shared list. */
    setSessions: (sessions: SessionDto[]) => void;
    playSound?: (source: string | undefined) => void;
  }) {
    this.config = config;
    this.api = api;
    this.sessionsState = sessionsState;
    this.setSessions = setSessions;
    this.playSound = playSound;
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
   * Readies the reply chime when the embed turned it on. Call it while the
   * visitor clicks or types, the only moment a browser unlocks audio.
   */
  primeSound = () => {
    if (this.config.unreadNotifications?.sound) {
      primeUnreadSound(this.customSoundSource());
    }
  };

  /** The embed's own sound URL; `undefined` means the built-in chime. */
  private customSoundSource = () => {
    const sound = this.config.unreadNotifications?.sound;
    return typeof sound === 'string' ? sound : undefined;
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
    const loaded = this.sessionsState.get().didLoadFirstPage;
    const loadedUpTo = this.loadedUpTo;
    if (loaded && loadedUpTo === null) {
      this.loadedUpTo = Math.max(
        Number.NEGATIVE_INFINITY,
        ...rows.map(updatedAtOf),
      );
    }
    const unreadSessionIds: string[] = [];
    const replies: SessionDto[] = [];
    for (const row of rows) {
      const before = this.lastSeen.get(row.id);
      const updatedAt = updatedAtOf(row);
      this.lastSeen.set(row.id, { unread: row.unread === true, updatedAt });
      if (row.id === this.viewingSessionId) {
        if (
          row.unread === true ||
          (row.unread === false && !this.reportedSessionIds.has(row.id))
        ) {
          this.markViewedSessionRead(row.id);
        }
        continue;
      }
      if (row.unread !== true) continue;
      unreadSessionIds.push(row.id);
      if (loadedUpTo === null) continue;
      const isNews = before
        ? !before.unread || updatedAt > before.updatedAt
        : updatedAt > loadedUpTo;
      if (isNews) replies.push(row);
    }
    this.state.set({ unreadSessionIds, count: unreadSessionIds.length });
    this.notifyCount(unreadSessionIds.length);
    this.announceReplies(replies);
  };

  private announceReplies = (replies: SessionDto[]) => {
    if (replies.length === 0) return;
    for (const session of replies) {
      try {
        this.config.hooks?.onUnreadReply?.({ session });
      } catch (hookError) {
        log.error('onUnreadReply hook failed', hookError);
      }
    }
    if (!this.config.unreadNotifications?.sound) return;
    const now = Date.now();
    if (now - this.lastChimeAt < MIN_CHIME_GAP_MS) return;
    this.lastChimeAt = now;
    this.playSound(this.customSoundSource());
  };

  private markViewedSessionRead = (sessionId: string) => {
    if (this.readsInFlight.has(sessionId)) return;
    this.readsInFlight.add(sessionId);
    let lookAgain = false;
    this.api
      .markSessionRead({ sessionId })
      .then(({ data }) => {
        if (!data || this.disposed) return;
        this.reportedSessionIds.add(sessionId);
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

function updatedAtOf(row: SessionDto): number {
  return new Date(row.updatedAt).getTime();
}

function isNewer(row: SessionDto, than: SessionDto): boolean {
  return updatedAtOf(row) > updatedAtOf(than);
}
