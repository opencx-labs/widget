import { PrimitiveState } from '../utils/PrimitiveState';
import { ApiCaller } from '../api/api-caller';
import { type WidgetConfig } from '../types/widget-config';
import { type Dto } from '../api/client';
import type { StorageCtx } from './storage.ctx';
import { v4 } from 'uuid';

type ContactState = {
  contact: {
    token: string;
    externalId: string | undefined;
  } | null;
  extraCollectedData: Record<string, string> | undefined;
  isCreatingUnverifiedContact: boolean;
  isErrorCreatingUnverifiedContact: boolean;
};

export class ContactCtx {
  private config: WidgetConfig;
  private storageCtx?: StorageCtx;
  private api: ApiCaller;
  state: PrimitiveState<ContactState>;

  constructor({
    config,
    api,
    storageCtx,
  }: {
    api: ApiCaller;
    config: WidgetConfig;
    storageCtx?: StorageCtx;
  }) {
    this.config = config;
    this.storageCtx = storageCtx;
    this.api = api;

    this.state = new PrimitiveState<ContactState>({
      contact: config.user?.token
        ? {
            token: config.user.token,
            // Set optional externalId from config... not local storage
            externalId: config.user.externalId,
          }
        : null,
      extraCollectedData: undefined,
      isCreatingUnverifiedContact: false,
      isErrorCreatingUnverifiedContact: false,
    });

    this.autoCreateUnverifiedUserIfNotExists();
  }

  shouldCollectData = (): boolean => {
    if (!this.state.get().contact?.token && this.config.collectUserData) {
      return true;
    }
    return false;
  };

  private autoCreateUnverifiedUserIfNotExists = async () => {
    /**
     * If token is passed in config... we consider it as a verified user and do nothing (we don't force generate an externalId)
     * If a non-verified user take their token and place it in the config... the backend will refuse their requests saying that a non-verified token must have an externalId to create and get sessions
     */
    if (this.config.user?.token) return;

    /**
     * If collectUserData is true... we check if the user entered their credentials before, otherwise, show them the welcome screen so they can enter their credentials
     */
    if (this.config.collectUserData && !this.config.user?.data?.email) {
      /**
       * If extra data collection fields are passed,
       * we do not check for a persisted token.
       * This will force the contact to enter the extra data fields every time they visit the page.
       */
      if (this.config.extraDataCollectionFields?.length) {
        return;
      }

      const persistedToken = await this.storageCtx?.getContactToken();
      if (persistedToken) {
        await this.setUnverifiedContact(persistedToken);
      }
      // return early whether there is a persisted token or not
      return;
    }

    /**
     * If there is no email, then it is an anonymous contact, we check if the contact is persisted or we create a new one
     */
    if (!this.config.user?.data?.email) {
      const persistedToken = await this.storageCtx?.getContactToken();
      if (persistedToken) {
        await this.setUnverifiedContact(persistedToken);
        // return early only if there is a persisted token
        return;
      }
    }

    /**
     * If we reach here... then it is one of two
     * 1. There is an email passed in the config, let's just upsert the unverified contact without checking for persistence; maybe the email in the config did change.
     * 2. It is an anonymous contact (without an email) using this device for the first time.
     *
     * This is still safe even if the email in the config is tampered with by the contact, because there is a client-side externalId that will be generated for the current device...
     * So, only sessions created on this device will be accessible.
     */
    await this.createUnverifiedContact({
      email: this.config.user?.data?.email,
      non_verified_name: this.config.user?.data?.name,
      non_verified_custom_data: this.config.user?.data?.customData,
    });
  };

  createUnverifiedContact = async (
    payload: Dto['CreateUnverifiedContactDto'],
    extraCollectedData?: Record<string, string>,
  ): Promise<void> => {
    this.state.setPartial({ extraCollectedData });

    try {
      this.state.setPartial({
        isCreatingUnverifiedContact: true,
        isErrorCreatingUnverifiedContact: false,
      });

      const { data } = await this.api.createUnverifiedContact(payload);
      if (data?.token) {
        await this.setUnverifiedContact(data.token);
      } else {
        this.state.setPartial({ isErrorCreatingUnverifiedContact: true });
      }
    } catch (e) {
      // A THROWN failure (offline, DNS, 5xx) must land on the same state as a
      // response that carried no token — callers read the flag, not an
      // exception. Without this catch the rejection escapes to the widget's
      // fire-and-forget send (`void sendMessage(...)`) and surfaces as an
      // unhandled promise rejection in the EMBEDDER's page, while the flag
      // stays false so nothing in the UI ever reports the failure.
      this.state.setPartial({ isErrorCreatingUnverifiedContact: true });
      console.error('opencx-widget: failed to create an unverified contact', {
        _e: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.state.setPartial({ isCreatingUnverifiedContact: false });
    }
  };

  /**
   * A persisted contact token can go stale — it no longer resolves to a
   * contact and the backend answers 401 "Invalid token". Drop the dead token,
   * clear auth, and mint a fresh anonymous contact so the widget self-heals
   * instead of getting stuck on create-session. No-op for a config-provided
   * verified token (authoritative — re-minting it is not ours to do).
   * Returns true if a fresh contact token was obtained.
   */
  recoverFromStaleToken = async (): Promise<boolean> => {
    if (this.config.user?.token) return false;
    this.api.setAuthToken('');
    // `null`, not `undefined` — `ContactState.contact` declares `| null` as its
    // one "no contact" sentinel, and a second representation eventually
    // disagrees with a `=== null` check somewhere downstream.
    this.state.setPartial({ contact: null });
    try {
      await this.storageCtx?.clearContactToken();
    } catch (error) {
      // Storage is an embedder-provided adapter. A broken adapter must not keep
      // the runtime authenticated with a token the server already rejected.
      console.warn('opencx-widget: failed to clear a stale contact token', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await this.createUnverifiedContact({
      email: this.config.user?.data?.email,
      non_verified_name: this.config.user?.data?.name,
      non_verified_custom_data: this.config.user?.data?.customData,
    });
    return Boolean(this.state.get().contact?.token);
  };

  setUnverifiedContact = async (token: string) => {
    const persistedExternalId = await this.storageCtx?.getExternalContactId();
    /** Give priority to `externalId` from the config */
    const externalId: string =
      this.config.user?.externalId || persistedExternalId || v4();
    this.api.setAuthToken(token);
    // Set token in state after setting the token in the api handler
    await this.storageCtx?.setContactToken(token);
    await this.storageCtx?.setExternalContactId(externalId);
    this.state.setPartial({ contact: { token, externalId } });
  };
}
