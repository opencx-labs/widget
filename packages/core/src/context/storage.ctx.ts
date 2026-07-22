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
}
