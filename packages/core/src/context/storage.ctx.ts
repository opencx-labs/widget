import type { ExternalStorage } from '../types/external-storage';
import type { WidgetConfig } from '../types/widget-config';

export class StorageCtx {
  private storage: ExternalStorage;
  private config: WidgetConfig;

  private KEYS = {
    contactToken: (orgToken: string) =>
      `opencx-widget:org-token-${orgToken}:contact-token`,
    externalContactId: (orgToken: string) =>
      `opencx-widget:org-token-${orgToken}:external-contact-id`,
    companionPreference: (
      orgToken: string,
      agentId: string | undefined,
      preference: 'pill-offset-x' | 'sidebar-width',
    ) =>
      `opencx-widget:org-token-${orgToken}:agent-${agentId ?? 'default'}:companion-${preference}`,
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

  setExternalContactId = async (id: string) => {
    await this.storage.set(this.KEYS.externalContactId(this.config.token), id);
  };
  getExternalContactId = async () => {
    return this.storage.get(this.KEYS.externalContactId(this.config.token));
  };

  private companionKey = (
    preference: 'pill-offset-x' | 'sidebar-width',
  ): string =>
    this.KEYS.companionPreference(
      this.config.token,
      this.config.agentId,
      preference,
    );

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
}
