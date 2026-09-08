import { ApiCaller } from '../api/api-caller';
import type { ModeDto } from '../types/dtos';
import type { ExternalStorage } from '../types/external-storage';
import type { WidgetConfig } from '../types/widget-config';
import { ActiveSessionPollingCtx } from './active-session-polling.ctx';
import { ContactCtx } from './contact.ctx';
import { UploadCtx } from './upload.ctx';
import { CsatCtx } from './csat.ctx';
import { DictationCtx } from './dictation.ctx';
import { MessageCtx } from './message.ctx';
import { RouterCtx } from './router.ctx';
import { SessionCtx } from './session.ctx';
import { StorageCtx } from './storage.ctx';
import {
  resolveClientFeatures,
  resolveWidgetAgent,
  type WidgetAgent,
  type WidgetClientFeatures,
} from './widget-agent';
import { log } from '../utils/log';

/** A configuration failure that prevents the widget from choosing a safe
 * runtime. The code is stable so headless consumers can render their own
 * recovery UI without matching error-message text. */
export class WidgetInitializationError extends Error {
  readonly code: 'config-fetch-failed';
  readonly details: unknown;

  constructor(code: 'config-fetch-failed', message: string, details?: unknown) {
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
  public uploadCtx: UploadCtx;
  public dictationCtx: DictationCtx;
  public routerCtx: RouterCtx;
  public storageCtx?: StorageCtx;
  public modes: ModeDto[] = [];

  public org: {
    id: string;
    name: string;
  };
  /**
   * The org's agent — branding plus which engine serves it — resolved by the
   * backend at init. The `bot` option overrides the branding at render time.
   */
  public readonly agent: WidgetAgent;

  /**
   * Whether turns stream (the v5 agent-chat engine) or use the blocking
   * bot-chat send. Decided by the SERVER per org; the single source for every
   * "which engine?" decision in the widget.
   */
  public get streaming(): boolean {
    return this.agent.streaming;
  }

  /**
   * The org's features narrowed by this embed's `config.features` — the
   * answers the UI asks for, resolved once for the ctx lifetime.
   */
  public readonly features: WidgetClientFeatures;

  private static pollingIntervalsSeconds: {
    session: number;
    sessions: number;
  } | null = null;
  private activeSessionPollingCtx: ActiveSessionPollingCtx;

  private constructor({
    config,
    storage,
    getClientCapabilities,
    modes,
    org,
    agent,
    parent,
  }: {
    config: WidgetConfig;
    storage?: ExternalStorage;
    getClientCapabilities?: () => WidgetConfig['capabilities'];
    modes: ModeDto[];
    org: {
      id: string;
      name: string;
    };
    agent: WidgetAgent;
    parent?: WidgetCtx;
  }) {
    if (!WidgetCtx.pollingIntervalsSeconds) {
      throw Error(
        'Widget polling values are not defined, did you call WidgetCtx.initialize()',
      );
    }

    this.config = config;
    this.org = org;
    this.agent = agent;
    this.features = resolveClientFeatures(agent, config);
    this.api = parent?.api ?? new ApiCaller({ config });
    this.storageCtx =
      parent?.storageCtx ??
      (storage ? new StorageCtx({ storage, config }) : undefined);
    this.modes = modes;

    this.contactCtx =
      parent?.contactCtx ??
      new ContactCtx({
        api: this.api,
        config: this.config,
        storageCtx: this.storageCtx,
      });

    this.sessionCtx = new SessionCtx({
      config: this.config,
      api: this.api,
      contactCtx: this.contactCtx,
      // Remembers the open conversation so a reload can return to it.
      storageCtx: parent ? undefined : this.storageCtx,
      sharedSessions: parent?.sessionCtx.sessionsState,
      sessionsPollingIntervalSeconds:
        WidgetCtx.pollingIntervalsSeconds.sessions,
    });

    this.messageCtx = new MessageCtx({
      config: this.config,
      api: this.api,
      sessionCtx: this.sessionCtx,
      contactCtx: this.contactCtx,
      // Streaming orgs send their turns over the AI SDK transport instead of
      // the blocking bot-chat send.
      streaming: this.streaming,
      sendsPageContext: this.features.pageContext,
      getClientCapabilities,
    });

    this.uploadCtx = new UploadCtx(this.api);
    this.csatCtx = new CsatCtx({
      api: this.api,
      sessionCtx: this.sessionCtx,
      messageCtx: this.messageCtx,
    });

    this.dictationCtx = new DictationCtx({
      api: this.api,
      config: this.config,
    });

    this.activeSessionPollingCtx = new ActiveSessionPollingCtx({
      api: this.api,
      config: this.config,
      sessionCtx: this.sessionCtx,
      messageCtx: this.messageCtx,
      sessionPollingIntervalSeconds: WidgetCtx.pollingIntervalsSeconds.session,
    });

    this.routerCtx = new RouterCtx(this);
  }

  static initialize = async ({
    config,
    storage,
    getClientCapabilities,
  }: {
    config: WidgetConfig;
    storage?: ExternalStorage;
    getClientCapabilities?: () => WidgetConfig['capabilities'];
  }) => {
    const externalConfig = await new ApiCaller({
      config,
    }).getExternalWidgetConfig();

    if (!externalConfig.data) {
      // Surface the backend's reason instead of failing mutely.
      log.error('widget config fetch failed', externalConfig.error);
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

    return new WidgetCtx({
      config,
      storage,
      getClientCapabilities,
      modes: externalConfig.data.modes || [],
      org: {
        id: externalConfig.data.org.id,
        name: externalConfig.data.org.name,
      },
      agent: resolveWidgetAgent(externalConfig.data),
    });
  };

  /** Independent send/history lifecycle, sharing the authenticated visitor and session list. */
  createConversation = (): WidgetCtx => {
    const conversation = new WidgetCtx({
      config: {
        ...this.config,
        router: {
          ...this.config.router,
          restoreLastSession: false,
          chatScreenOnly: false,
          goToChatIfNoSessions: false,
        },
      },
      modes: this.modes,
      org: this.org,
      agent: this.agent,
      parent: this,
    });
    conversation.routerCtx.state.setPartial({
      screen: this.contactCtx.shouldCollectData() ? 'welcome' : 'chat',
    });
    return conversation;
  };

  /** Release a closed companion runtime after its last send has settled. */
  releaseConversation = () => {
    this.routerCtx.dispose();
    this.resetChat();
  };

  resetChat = () => {
    this.sessionCtx.reset();
    this.messageCtx.reset();
    this.uploadCtx.reset();
  };

  /**
   * Ingest the canonical rows the backend persisted for a streamed turn.
   * Called by the agent-chat surface when a turn finishes; the polling
   * context owns history mapping/dedupe, so this delegates to it.
   */
  reconcileAfterStream = (sessionId: string): Promise<void> =>
    this.activeSessionPollingCtx.reconcileAfterStream(sessionId);
}
