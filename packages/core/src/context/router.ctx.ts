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

    this.registerRoutingListener();
  }

  private registerRoutingListener = () => {
    this.contactCtx.state.subscribe(({ contact }) => {
      // Auto navigate to sessions screen after collecting user data
      if (contact?.token && this.state.get().screen === 'welcome') {
        this.state.setPartial({
          screen: this.config.router?.chatScreenOnly ? 'chat' : 'sessions',
        });
      }
    });

    this.sessionCtx.sessionsState.subscribe(
      ({ isInitialFetchLoading, data }) => {
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
      },
    );
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
