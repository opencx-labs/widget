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
import { PrimitiveState } from '../utils/PrimitiveState';
import type { CtaOverride } from '../cta/cta-visibility';

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

  /**
   * The chat composer's draft text. Lifted out of the input component so it can
   * be set programmatically (host-facing `prefill` trigger) and read/written by
   * `ChatInput`. Cleared on `resetChat()` to preserve the prior "draft clears on
   * new chat" behaviour.
   */
  public composerDraft = new PrimitiveState<string>('');

  /**
   * Host/API-driven override of the CTA card's visibility (`showCta()` /
   * `hideCta()`). `null` = the config rules decide. Deliberately NOT cleared
   * by `resetChat()` — the CTA is launcher state, not chat state.
   */
  public ctaOverride = new PrimitiveState<CtaOverride>(null);

  public org: {
    id: string;
    name: string;
  };
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
  }: {
    config: WidgetConfig;
    storage?: ExternalStorage;
    modes: ModeDto[];
    org: {
      id: string;
      name: string;
    };
  }) {
    if (!WidgetCtx.pollingIntervalsSeconds) {
      throw Error(
        'Widget polling values are not defined, did you call WidgetCtx.initialize()',
      );
    }

    this.config = config;
    this.org = org;
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
    });

    this.csatCtx = new CsatCtx({
      config: this.config,
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
      throw new Error('Failed to fetch widget config');
    }

    this.pollingIntervalsSeconds = {
      session: externalConfig.data?.sessionPollingIntervalSeconds || 10,
      sessions: externalConfig.data?.sessionsPollingIntervalSeconds || 60,
    };

    return new WidgetCtx({
      config,
      storage,
      modes: externalConfig.data?.modes || [],
      org: {
        id: externalConfig.data.org.id,
        name: externalConfig.data.org.name,
      },
    });
  };

  setComposerDraft = (text: string) => {
    this.composerDraft.set(text);
  };

  setCtaOverride = (value: CtaOverride) => {
    this.ctaOverride.set(value);
  };

  resetChat = () => {
    this.sessionCtx.reset();
    this.messageCtx.reset();
    this.composerDraft.reset();
  };
}
