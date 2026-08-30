import { ApiCaller } from '../api/api-caller';
import type { ModeDto } from '../types/dtos';
import type { ExternalStorage } from '../types/external-storage';
import type { WidgetConfig } from '../types/widget-config';
import { ActiveSessionPollingCtx } from './active-session-polling.ctx';
import { ContactCtx } from './contact.ctx';
import { CsatCtx } from './csat.ctx';
import { MessageCtx } from './message.ctx';
import { RouterCtx } from './router.ctx';
import { SessionCtx } from './session.ctx';
import { StorageCtx } from './storage.ctx';

export type WidgetInitializationErrorCode =
  | 'config-fetch-failed'
  | 'agent-binding-missing';

/** A configuration failure that prevents the widget from choosing a safe
 * runtime. The code is stable so headless consumers can render their own
 * recovery UI without matching error-message text. */
export class WidgetInitializationError extends Error {
  readonly code: WidgetInitializationErrorCode;
  readonly details: unknown;

  constructor(
    code: WidgetInitializationErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'WidgetInitializationError';
    this.code = code;
    this.details = details;
  }
}

export class WidgetCtx {
  public config: WidgetConfig;
  public api: ApiCaller;

  public contactCtx: ContactCtx;
  public sessionCtx: SessionCtx;
  public messageCtx: MessageCtx;
  public csatCtx: CsatCtx;
  public routerCtx: RouterCtx;
  public storageCtx?: StorageCtx;
  public modes: ModeDto[] = [];

  public org: {
    id: string;
    name: string;
  };
  /**
   * Branding of the bound agents-platform agent (config `agentId`), resolved
   * by the backend at init. Undefined when the embed is not agent-bound.
   * Server values win over the local `bot` option at render time.
   */
  public agent?: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };

  /**
   * Whether this embed is bound to an agents-platform agent (config `agentId`
   * resolved by the backend at init). Agent-bound embeds use the streaming
   * agent-chat engine; others use the blocking bot-chat send. The single
   * source for every "which engine?" decision.
   */
  public get isAgentBound(): boolean {
    return this.agent !== undefined;
  }

  private static pollingIntervalsSeconds: {
    session: number;
    sessions: number;
  } | null = null;
  private activeSessionPollingCtx: ActiveSessionPollingCtx;

  private constructor({
    config,
    storage,
    modes,
    org,
    agent,
  }: {
    config: WidgetConfig;
    storage?: ExternalStorage;
    modes: ModeDto[];
    org: {
      id: string;
      name: string;
    };
    agent?: {
      id: string;
      name: string;
      avatarUrl: string | null;
    };
  }) {
    if (!WidgetCtx.pollingIntervalsSeconds) {
      throw Error(
        'Widget polling values are not defined, did you call WidgetCtx.initialize()',
      );
    }

    this.config = config;
    this.org = org;
    this.agent = agent;
    this.api = new ApiCaller({ config });
    this.storageCtx = storage ? new StorageCtx({ storage, config }) : undefined;
    this.modes = modes;

    this.contactCtx = new ContactCtx({
      api: this.api,
      config: this.config,
      storageCtx: this.storageCtx,
    });

    this.sessionCtx = new SessionCtx({
      config: this.config,
      api: this.api,
      contactCtx: this.contactCtx,
      sessionsPollingIntervalSeconds:
        WidgetCtx.pollingIntervalsSeconds.sessions,
    });

    this.messageCtx = new MessageCtx({
      config: this.config,
      api: this.api,
      sessionCtx: this.sessionCtx,
      contactCtx: this.contactCtx,
      // Agent-bound embeds stream their turns (AI SDK transport) instead of
      // using the blocking bot-chat send.
      agentBound: this.isAgentBound,
    });

    this.csatCtx = new CsatCtx({
      api: this.api,
      sessionCtx: this.sessionCtx,
      messageCtx: this.messageCtx,
    });

    this.activeSessionPollingCtx = new ActiveSessionPollingCtx({
      api: this.api,
      config: this.config,
      sessionCtx: this.sessionCtx,
      messageCtx: this.messageCtx,
      sessionPollingIntervalSeconds: WidgetCtx.pollingIntervalsSeconds.session,
    });

    this.routerCtx = new RouterCtx({
      config: this.config,
      contactCtx: this.contactCtx,
      sessionCtx: this.sessionCtx,
      resetChat: this.resetChat,
    });
  }

  static initialize = async ({
    config,
    storage,
  }: {
    config: WidgetConfig;
    storage?: ExternalStorage;
  }) => {
    const externalConfig = await new ApiCaller({
      config,
    }).getExternalWidgetConfig();

    if (!externalConfig.data) {
      // Surface the backend's reason (e.g. an unservable `agentId`:
      // not_found / disabled / no_active_version) instead of failing mutely.
      console.error(
        '[opencx] widget config fetch failed',
        externalConfig.error,
      );
      throw new WidgetInitializationError(
        'config-fetch-failed',
        'Failed to fetch widget config',
        externalConfig.error,
      );
    }

    this.pollingIntervalsSeconds = {
      session: externalConfig.data?.sessionPollingIntervalSeconds || 10,
      sessions: externalConfig.data?.sessionsPollingIntervalSeconds || 60,
    };

    const serverAgent = externalConfig.data.agent;
    if (config.agentId && serverAgent?.id !== config.agentId) {
      throw new WidgetInitializationError(
        'agent-binding-missing',
        `Widget config did not resolve the requested agent ${config.agentId}`,
        { requestedAgentId: config.agentId, resolvedAgent: serverAgent },
      );
    }
    return new WidgetCtx({
      config,
      storage,
      modes: externalConfig.data?.modes || [],
      org: {
        id: externalConfig.data.org.id,
        name: externalConfig.data.org.name,
      },
      // snake_case (backend DTO) → camelCase (widget types) at the boundary.
      agent: serverAgent
        ? {
            id: serverAgent.id,
            name: serverAgent.name,
            avatarUrl: serverAgent.avatar_url,
          }
        : undefined,
    });
  };

  resetChat = () => {
    this.sessionCtx.reset();
    this.messageCtx.reset();
  };

  /**
   * Ingest the canonical rows the backend persisted for a streamed turn.
   * Called by the agent-chat surface when a turn finishes; the polling
   * context owns history mapping/dedupe, so this delegates to it.
   */
  reconcileAfterStream = (sessionId: string): Promise<void> =>
    this.activeSessionPollingCtx.reconcileAfterStream(sessionId);
}
