import type { SessionDto } from '../types/dtos';
import type { WidgetConfig } from '../types/widget-config';
import { PrimitiveState } from '../utils/PrimitiveState';
import type { ContactCtx } from './contact.ctx';
import type { SessionCtx } from './session.ctx';
import type { WidgetCtx } from './widget.ctx';

export type ScreenU =
  | /** A welcome screen to collect user data. Useful in public non-logged-in environments */
  'welcome'
  /** Show a list of the user's previous sessions */
  | 'sessions'
  /** Self-explanatory */
  | 'chat';

type RouterState = {
  screen: ScreenU;
};

export class RouterCtx {
  state: PrimitiveState<RouterState>;

  private config: WidgetConfig;
  private contactCtx: ContactCtx;
  private sessionCtx: SessionCtx;
  private resetChat: WidgetCtx['resetChat'];
  /**
   * Whether a reload returns the visitor to the conversation they were in.
   * Off by default: the home screen is the sessions list. Embedders whose
   * widget is a continuous assistant (an empty panel beside a live
   * conversation reads as data loss) opt in via `router.restoreLastSession`.
   */
  private readonly shouldRestoreLastSession: boolean;
  /** The stored pointer, until it is used or found unusable. */
  private restorableSessionId: string | null = null;
  /** Has the (async) storage read settled? Automatic routing waits for it. */
  private didReadStoredSession = false;

  constructor({
    config,
    contactCtx,
    sessionCtx,
    resetChat,
  }: {
    config: WidgetConfig;
    contactCtx: ContactCtx;
    sessionCtx: SessionCtx;
    resetChat: WidgetCtx['resetChat'];
  }) {
    this.config = config;
    this.contactCtx = contactCtx;
    this.sessionCtx = sessionCtx;
    this.resetChat = resetChat;
    this.state = new PrimitiveState<RouterState>({
      screen: this.contactCtx.shouldCollectData()
        ? 'welcome'
        : this.config.router?.chatScreenOnly
          ? 'chat'
          : 'sessions',
    });
    this.shouldRestoreLastSession =
      this.config.router?.restoreLastSession ?? false;

    this.readStoredSession();
    this.registerRoutingListener();
  }

  /**
   * Read the remembered conversation before any automatic routing runs. The
   * read is async (the storage adapter may be), and the sessions list can land
   * first — so routing is re-run once the pointer is known.
   */
  private readStoredSession = () => {
    if (!this.shouldRestoreLastSession) {
      this.didReadStoredSession = true;
      return;
    }
    void this.sessionCtx
      .getLastActiveSessionId()
      .then((sessionId) => {
        this.restorableSessionId = sessionId;
      })
      .finally(() => {
        this.didReadStoredSession = true;
        this.routeFromSessions(this.sessionCtx.sessionsState.get());
      });
  };

  private registerRoutingListener = () => {
    this.contactCtx.state.subscribe(({ contact }) => {
      // Auto navigate to sessions screen after collecting user data
      if (contact?.token && this.state.get().screen === 'welcome') {
        this.state.setPartial({
          screen: this.config.router?.chatScreenOnly ? 'chat' : 'sessions',
        });
      }
    });

    this.sessionCtx.sessionsState.subscribe(this.routeFromSessions);
  };

  /**
   * Every automatic route the sessions list can trigger, in one place so the
   * restore can re-run it once the stored pointer is known.
   */
  private routeFromSessions = ({
    isInitialFetchLoading,
    data,
  }: {
    isInitialFetchLoading: boolean;
    data: SessionDto[];
  }) => {
    // Hold automatic routing until we know whether there is a conversation to
    // return to: routing first and restoring second would flash the wrong
    // screen, or start a second conversation beside the live one.
    if (!this.didReadStoredSession) return;

    if (
      this.restorableSessionId &&
      !this.sessionCtx.sessionState.get().session?.id
    ) {
      const restored = data.find(
        (s) => s.id === this.restorableSessionId && s.isOpened,
      );
      if (restored) {
        this.restorableSessionId = null;
        this.toChatScreen(restored.id);
        return;
      }
      // Not in the list yet — the first page may still be loading. Once it has
      // landed, a pointer with no open session behind it (closed elsewhere,
      // deleted, another contact) is stale: drop it and route normally.
      if (isInitialFetchLoading) return;
      this.restorableSessionId = null;
    }

    if (
      this.config.router?.chatScreenOnly &&
      // Do not route to a chat if we are currently inside one already
      // This also applies to newly created sessions; the new session will be in `sessionState` before it is refreshed and included in `sessionsState`
      !this.sessionCtx.sessionState.get().session?.id
    ) {
      const mostRecentOpenSessionId = data.find((s) => s.isOpened)?.id;
      return mostRecentOpenSessionId
        ? this.toChatScreen(mostRecentOpenSessionId)
        : undefined;
    }

    if (data.length) return;
    if (this.config.router?.goToChatIfNoSessions === false) return;

    // Auto navigate to chat screen if contact has no previous sessions
    if (!isInitialFetchLoading && this.state.get().screen !== 'chat') {
      this.toChatScreen();
    }
  };

  toSessionsScreen = () => {
    this.resetChat();
    this.state.setPartial({ screen: 'sessions' });
  };

  /**
   * @param sessionId The ID of the session to open, or `undefined` if it is a new chat session
   */
  toChatScreen = (sessionId?: string) => {
    this.resetChat();

    let session: SessionDto | undefined;

    if (sessionId) {
      session = this.sessionCtx.sessionsState
        .get()
        .data.find((s) => s.id === sessionId);
      // Do not navigate if session is not found (this shouldn't happen, unless a wrong ID is passed)
      if (!session) return;
      this.sessionCtx.sessionState.setPartial({ session });
    }

    this.state.setPartial({ screen: 'chat' });

    this.config.hooks?.onNavigateToChat?.({
      session: session,
    });
  };
}
