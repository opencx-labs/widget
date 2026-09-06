import type { ExternalStorage } from '../types/external-storage';
import type {
  WidgetCompanionDefaultLayoutU,
  WidgetConfig,
  WidgetSidebarModeU,
} from '../types/widget-config';
import type { WidgetSidebarSideResolvedU } from '../utils/companion-layout';

/** The per-visitor companion preferences the widget remembers between visits. */
type CompanionPreferenceU =
  | 'pill-offset-x'
  | 'sidebar-width'
  | 'sidebar-side'
  | 'sidebar-mode'
  | 'layout';

export class StorageCtx {
  private storage: ExternalStorage;
  private config: WidgetConfig;

  private KEYS = {
    contactToken: (orgToken: string) =>
      `opencx-widget:org-token-${orgToken}:contact-token`,
    externalContactId: (orgToken: string) =>
      `opencx-widget:org-token-${orgToken}:external-contact-id`,
    companionPreference: (orgToken: string, preference: CompanionPreferenceU) =>
      `opencx-widget:org-token-${orgToken}:companion-${preference}`,
    activeSession: (orgToken: string) =>
      `opencx-widget:org-token-${orgToken}:active-session`,
  };

  constructor({
    storage,
    config,
  }: {
    storage: ExternalStorage;
    config: WidgetConfig;
  }) {
    this.storage = storage;
    this.config = config;
  }

  setContactToken = async (token: string) => {
    await this.storage.set(this.KEYS.contactToken(this.config.token), token);
  };
  getContactToken = async () => {
    return this.storage.get(this.KEYS.contactToken(this.config.token));
  };
  clearContactToken = async () => {
    await this.storage.remove(this.KEYS.contactToken(this.config.token));
  };

  /**
   * The conversation the visitor was last in. Only a POINTER lives here — the
   * messages themselves are on the backend — but without it a page reload
   * drops the visitor into an empty composer beside a conversation that is
   * still very much alive.
   */
  private activeSessionKey = (): string =>
    this.KEYS.activeSession(this.config.token);

  getActiveSessionId = async (): Promise<string | null> => {
    return this.storage.get(this.activeSessionKey());
  };
  setActiveSessionId = async (sessionId: string): Promise<void> => {
    await this.storage.set(this.activeSessionKey(), sessionId);
  };
  clearActiveSessionId = async (): Promise<void> => {
    await this.storage.remove(this.activeSessionKey());
  };

  setExternalContactId = async (id: string) => {
    await this.storage.set(this.KEYS.externalContactId(this.config.token), id);
  };
  getExternalContactId = async () => {
    return this.storage.get(this.KEYS.externalContactId(this.config.token));
  };

  private companionKey = (preference: CompanionPreferenceU): string =>
    this.KEYS.companionPreference(this.config.token, preference);

  private getFiniteNumber = async (key: string): Promise<number | null> => {
    const raw = await this.storage.get(key);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  getCompanionPillOffsetX = async (): Promise<number | null> =>
    this.getFiniteNumber(this.companionKey('pill-offset-x'));

  setCompanionPillOffsetX = async (offset: number): Promise<void> => {
    if (!Number.isFinite(offset)) return;
    await this.storage.set(this.companionKey('pill-offset-x'), String(offset));
  };

  getCompanionSidebarWidth = async (): Promise<number | null> =>
    this.getFiniteNumber(this.companionKey('sidebar-width'));

  setCompanionSidebarWidth = async (width: number): Promise<void> => {
    if (!Number.isFinite(width)) return;
    await this.storage.set(this.companionKey('sidebar-width'), String(width));
  };

  /**
   * The visitor's own sidebar side/mode, once they have picked one in the
   * layout menu. Absent until then, so `companion.sidebar.*` config keeps
   * deciding for a visitor who never touched the control. Unrecognized stored
   * values read as absent rather than poisoning the layout.
   */
  getCompanionSidebarSide =
    async (): Promise<WidgetSidebarSideResolvedU | null> => {
      const raw = await this.storage.get(this.companionKey('sidebar-side'));
      return raw === 'left' || raw === 'right' ? raw : null;
    };

  setCompanionSidebarSide = async (
    side: WidgetSidebarSideResolvedU,
  ): Promise<void> => {
    await this.storage.set(this.companionKey('sidebar-side'), side);
  };

  /**
   * The RESTING layout the visitor last picked in the layout menu. Absent
   * until they pick one, so `companion.defaultLayout` keeps deciding for a
   * visitor who never touched the control.
   *
   * `fullscreen` is deliberately unstorable: it is a mode the visitor enters
   * on top of a resting layout (Escape drops back out of it), so persisting
   * it would reopen every future visit full-screen over the host page.
   */
  getCompanionLayout =
    async (): Promise<WidgetCompanionDefaultLayoutU | null> => {
      const raw = await this.storage.get(this.companionKey('layout'));
      return raw === 'compact' || raw === 'sidebar' ? raw : null;
    };

  setCompanionLayout = async (
    layout: WidgetCompanionDefaultLayoutU,
  ): Promise<void> => {
    await this.storage.set(this.companionKey('layout'), layout);
  };

  getCompanionSidebarMode = async (): Promise<WidgetSidebarModeU | null> => {
    const raw = await this.storage.get(this.companionKey('sidebar-mode'));
    return raw === 'docked' || raw === 'floating' ? raw : null;
  };

  setCompanionSidebarMode = async (mode: WidgetSidebarModeU): Promise<void> => {
    await this.storage.set(this.companionKey('sidebar-mode'), mode);
  };
}
