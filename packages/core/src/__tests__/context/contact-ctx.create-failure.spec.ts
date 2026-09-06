// A THROWN contact-creation failure (offline, DNS, 5xx) must land on the same
// state as a response that carried no token. Before the fix `createUnverifiedContact`
// had `try/finally` with no `catch`, so a network failure did two bad things at
// once: the rejection escaped through `recoverFromStaleToken` → `createSession`
// → the widget's fire-and-forget `void sendMessage(...)` and became an unhandled
// promise rejection in the EMBEDDER's page, while `isErrorCreatingUnverifiedContact`
// stayed false so nothing in the UI ever reported the failure.
import {
  afterEach,
  beforeEach,
  expect,
  suite,
  test,
  vi,
  type MockInstance,
} from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { StorageCtx } from '../../context/storage.ctx';
import type { ExternalStorage } from '../../types/external-storage';
import type { WidgetConfig } from '../../types/widget-config';

const config: WidgetConfig = {
  token: 'test-token',
  apiUrl: 'https://api.test.local',
} as WidgetConfig;

function buildContactCtx(): ContactCtx {
  return new ContactCtx({ api: new ApiCaller({ config }), config });
}

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

suite('createUnverifiedContact — network failure', () => {
  test('does not reject: a thrown fetch is reported through state, not an exception', async () => {
    fetchSpy.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const contactCtx = buildContactCtx();

    // The assertion IS that this resolves. An unhandled rejection here is what
    // reached the embedder's page.
    await expect(
      contactCtx.createUnverifiedContact({}),
    ).resolves.toBeUndefined();
  });

  test('sets the error flag so the UI can report the failure', async () => {
    fetchSpy.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const contactCtx = buildContactCtx();

    await contactCtx.createUnverifiedContact({});

    expect(contactCtx.state.get().isErrorCreatingUnverifiedContact).toBe(true);
  });

  test('clears the in-flight flag even when the request throws', async () => {
    fetchSpy.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const contactCtx = buildContactCtx();

    await contactCtx.createUnverifiedContact({});

    expect(contactCtx.state.get().isCreatingUnverifiedContact).toBe(false);
  });

  test('a 200 carrying no token reaches the SAME state as a thrown failure', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const contactCtx = buildContactCtx();

    await contactCtx.createUnverifiedContact({});

    expect(contactCtx.state.get().isErrorCreatingUnverifiedContact).toBe(true);
    expect(contactCtx.state.get().isCreatingUnverifiedContact).toBe(false);
  });

  test('recoverFromStaleToken returns false instead of throwing when re-minting fails', async () => {
    fetchSpy.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const contactCtx = buildContactCtx();

    await expect(contactCtx.recoverFromStaleToken()).resolves.toBe(false);
  });

  test('recoverFromStaleToken clears the contact to null, never undefined', async () => {
    fetchSpy.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const contactCtx = buildContactCtx();

    await contactCtx.recoverFromStaleToken();

    // `ContactState.contact` declares `| null` as its one "no contact" sentinel.
    // A second representation eventually disagrees with a `=== null` check.
    expect(contactCtx.state.get().contact).toBeNull();
  });

  test('a failing storage adapter cannot block stale-token recovery', async () => {
    const recoveryConfig: WidgetConfig = {
      ...config,
      collectUserData: true,
      extraDataCollectionFields: ['account'],
    };
    const storage: ExternalStorage = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockRejectedValue(new Error('storage unavailable')),
    };
    const api = new ApiCaller({ config: recoveryConfig });
    const contactCtx = new ContactCtx({
      api,
      config: recoveryConfig,
      storageCtx: new StorageCtx({ storage, config: recoveryConfig }),
    });
    contactCtx.state.setPartial({
      contact: { token: 'stale', externalId: 'external' },
    });
    vi.spyOn(contactCtx, 'createUnverifiedContact').mockImplementation(
      async () => {
        contactCtx.state.setPartial({
          contact: { token: 'fresh', externalId: 'external' },
        });
      },
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(contactCtx.recoverFromStaleToken()).resolves.toBe(true);
    expect(contactCtx.state.get().contact?.token).toBe('fresh');
  });
});
