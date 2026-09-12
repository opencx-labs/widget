import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPreviewState,
  createPreviewBackend,
  parsePreviewMode,
  parsePreviewState,
  preview,
} from './connections.preview-api';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const origin = 'https://preview.example';
const fallback = vi.fn<typeof fetch>();

function backend(
  mode: 'default' | 'oto' | 'mollie',
  state: 'idle' | 'slow' | 'error' | 'reconnect' = 'idle',
  storage = new MemoryStorage(),
) {
  return {
    fetch: createPreviewBackend({ fallback, mode, origin, state, storage }),
    storage,
  };
}

function post(fetcher: typeof fetch, path: string, body: unknown) {
  return fetcher(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function property(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Reflect.get(value, key);
}

async function createSession(fetcher: typeof fetch) {
  const response: unknown = await (
    await post(fetcher, '/backend/widget/v2/create-session', {})
  ).json();
  const id = property(response, 'id');
  if (typeof id !== 'string') throw new Error('Missing session id');
  return id;
}

afterEach(() => fallback.mockReset());

describe('connection preview backend', () => {
  it('creates distinct sessions and lists each once', async () => {
    const { fetch } = backend('mollie');
    const firstId = await createSession(fetch);
    const secondId = await createSession(fetch);
    expect(secondId).not.toBe(firstId);

    const sessions: unknown = await (
      await fetch(`${origin}/backend/widget/v2/sessions`)
    ).json();
    expect(property(sessions, 'items')).toEqual([
      expect.objectContaining({ id: secondId }),
      expect.objectContaining({ id: firstId }),
    ]);
  });

  it('isolates messages and connection requests while preserving account access across sessions', async () => {
    const { fetch, storage } = backend('mollie');
    const firstId = await createSession(fetch);
    await (
      await post(fetch, '/backend/widget/v5/chat/stream', {
        session_id: firstId,
        content: 'Check the first account request.',
      })
    ).text();
    const secondId = await createSession(fetch);
    const poll = (id: string) =>
      fetch(`${origin}/backend/widget/v2/poll/${id}`).then((r) => r.json());
    const messages = (id: string) =>
      fetch(`${origin}/backend/widget/v5/chat/${id}/messages`).then((r) =>
        r.json(),
      );
    expect(property(await poll(secondId), 'history')).toEqual([]);
    expect(property(await messages(secondId), 'turns')).toEqual([]);
    expect(JSON.stringify(await messages(firstId))).toContain(
      'connection_required',
    );

    storage.setItem(preview.storageKeys.connected('mollie'), 'true');
    // A late completion must update the original session, even after another opens.
    const requestId = '33333333-3333-4333-8333-000000000001';
    await (
      await post(fetch, '/backend/widget/v5/chat/stream', {
        session_id: firstId,
        content: 'Resume the first request.',
        clientContext: {
          opencx__background: true,
          opencx__connection_request_id: requestId,
        },
      })
    ).text();
    const secondReply = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: secondId,
      content: 'Check the second account request.',
    });
    expect(await secondReply.text()).not.toContain('connection_required');
    const firstHistory = JSON.stringify(await poll(firstId));
    const secondHistory = JSON.stringify(await poll(secondId));
    expect(firstHistory).toContain('Check the first account request.');
    expect(firstHistory).not.toContain('Check the second account request.');
    expect(secondHistory).toContain('Check the second account request.');
    expect(secondHistory).not.toContain('Check the first account request.');
    expect(secondHistory).toContain(preview.answers.mollie);
    expect(
      property(await messages(firstId), 'handled_connection_request_ids'),
    ).toEqual([requestId]);
    expect(
      property(await messages(secondId), 'handled_connection_request_ids'),
    ).toEqual([]);
  });

  it('rejects unknown sessions instead of returning another session history', async () => {
    const { fetch } = backend('default');
    const sessionId = await createSession(fetch);
    await (
      await post(fetch, '/backend/widget/v5/chat/stream', {
        session_id: sessionId,
        content: preview.questions.default,
      })
    ).text();
    for (const path of ['v2/poll', 'v5/chat']) {
      const suffixes = path === 'v2/poll' ? [''] : ['/messages', '/stream'];
      for (const suffix of suffixes) {
        expect(
          (
            await fetch(
              `${origin}/backend/widget/${path}/${sessionId}${suffix}`,
            )
          ).status,
        ).toBe(suffix === '/stream' ? 204 : 200);
        expect(
          (await fetch(`${origin}/backend/widget/${path}/missing${suffix}`))
            .status,
        ).toBe(404);
      }
    }
    for (const id of [undefined, 'missing']) {
      expect(
        (
          await post(fetch, '/backend/widget/v5/chat/stream', {
            session_id: id,
            content: 'Must not enter another session.',
          })
        ).status,
      ).toBe(404);
    }
    const saved = JSON.stringify(
      await (
        await fetch(`${origin}/backend/widget/v2/poll/${sessionId}`)
      ).json(),
    );
    expect(saved).toContain(preview.questions.default);
    expect(saved).not.toContain('Must not enter another session.');
  });

  it('enables streaming and emits a complete connection request through SSE', async () => {
    const { fetch } = backend('oto');
    const sessionId = await createSession(fetch);
    const config: unknown = await (
      await fetch(`${origin}/backend/widget/v2/config`)
    ).json();
    expect(property(property(config, 'agent'), 'streaming')).toBe(true);

    const response = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '77777777-7777-4777-8777-777777777777',
      content: preview.questions.oto,
    });
    const body = await response.text();
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(body).toContain('"type":"tool-output-available"');
    expect(body).toContain('"connection_required"');
    expect(body).toContain('"request_id"');
    expect(body).toContain('"data-turn-settled"');
  });

  it('serves settled history on reload and reports no active resumed stream', async () => {
    const { fetch } = backend('oto');
    const sessionId = await createSession(fetch);
    const streamed = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '77777777-7777-4777-8777-777777777777',
      content: preview.questions.oto,
    });
    await streamed.text();

    const poll = await fetch(`${origin}/backend/widget/v2/poll/${sessionId}`);
    const history = JSON.stringify(await poll.json());
    expect(history).toContain(preview.questions.oto);
    expect(history).toContain('Connect OTO so I can check your account.');

    const turnMessages = await fetch(
      `${origin}/backend/widget/v5/chat/${sessionId}/messages`,
    );
    expect(JSON.stringify(await turnMessages.json())).toContain(
      'connection_required',
    );

    const resumed = await fetch(
      `${origin}/backend/widget/v5/chat/${sessionId}/stream`,
    );
    expect(resumed.status).toBe(204);
    expect(await resumed.text()).toBe('');
  });

  it('does not leak a background continuation into reloaded history', async () => {
    const { fetch, storage } = backend('oto');
    const sessionId = await createSession(fetch);
    const connectionRequestId = '33333333-3333-4333-8333-000000000001';
    const initial = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '77777777-7777-4777-8777-777777777777',
      content: preview.questions.oto,
    });
    await initial.text();
    storage.setItem(preview.storageKeys.connected('oto'), 'true');

    const continuation =
      'The connection to OTO is ready. Please use its tools to continue my previous request.';
    const resumed = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '88888888-8888-4888-8888-888888888888',
      content: continuation,
      clientContext: {
        opencx__background: true,
        opencx__connection_request_id: connectionRequestId,
      },
    });
    await resumed.text();

    const poll = await fetch(`${origin}/backend/widget/v2/poll/${sessionId}`);
    const history = JSON.stringify(await poll.json());
    expect(history).toContain(preview.questions.oto);
    expect(history).toContain(preview.answers.oto);
    expect(history).not.toContain(continuation);
    expect(history).not.toContain('88888888-8888-4888-8888-888888888888');

    const turnMessages: unknown = await (
      await fetch(`${origin}/backend/widget/v5/chat/${sessionId}/messages`)
    ).json();
    expect(property(turnMessages, 'handled_connection_request_ids')).toEqual([
      connectionRequestId,
    ]);
    expect(JSON.stringify(turnMessages)).toContain(connectionRequestId);
  });

  it('does not handle a pending connection request after an ordinary send', async () => {
    const { fetch } = backend('oto');
    const sessionId = await createSession(fetch);
    const initial = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '77777777-7777-4777-8777-777777777777',
      content: preview.questions.oto,
    });
    expect(await initial.text()).toContain(
      '33333333-3333-4333-8333-000000000001',
    );

    const ordinary = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '88888888-8888-4888-8888-888888888888',
      content: 'Can you answer a general question first?',
    });
    await ordinary.text();

    const turnMessages: unknown = await (
      await fetch(`${origin}/backend/widget/v5/chat/${sessionId}/messages`)
    ).json();
    expect(property(turnMessages, 'handled_connection_request_ids')).toEqual(
      [],
    );
    expect(JSON.stringify(turnMessages)).toContain(
      '33333333-3333-4333-8333-000000000001',
    );
  });

  it('exposes the owner-bound OAuth attempt outcome', async () => {
    const { fetch, storage } = backend('oto');
    const started: unknown = await (
      await post(
        fetch,
        '/backend/widget/v5/connections/11111111-1111-4111-8111-111111111111/start',
        { request_id: '33333333-3333-4333-8333-333333333333' },
      )
    ).json();
    const attemptId = property(started, 'attempt_id');
    expect(typeof attemptId).toBe('string');
    if (typeof attemptId !== 'string') throw new Error('Missing attempt id');
    expect(started).toMatchObject({ completion: 'oauth' });

    const pending: unknown = await (
      await fetch(
        `${origin}/backend/widget/v5/connections/11111111-1111-4111-8111-111111111111/attempts/${attemptId}`,
      )
    ).json();
    expect(pending).toEqual({ status: 'pending' });

    storage.setItem(preview.storageKeys.attempt(attemptId), 'connected');
    const outcome: unknown = await (
      await fetch(
        `${origin}/backend/widget/v5/connections/11111111-1111-4111-8111-111111111111/attempts/${attemptId}`,
      )
    ).json();
    expect(outcome).toEqual({ status: 'connected' });
  });

  it('keeps customer-managed setup external and continues after its grant', async () => {
    const { fetch, storage } = backend('mollie');
    const sessionId = await createSession(fetch);
    const started: unknown = await (
      await post(
        fetch,
        '/backend/widget/v5/connections/11111111-1111-4111-8111-111111111111/start',
        { request_id: '33333333-3333-4333-8333-333333333333' },
      )
    ).json();
    expect(started).toMatchObject({ completion: 'external' });
    expect(property(started, 'attempt_id')).toBeUndefined();

    storage.setItem(preview.storageKeys.connected('mollie'), 'true');
    const response = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '88888888-8888-4888-8888-888888888888',
      content: 'Continue the request.',
    });
    const body = await response.text();
    expect(body).toContain(preview.answers.mollie);
    expect(body).not.toContain('connection_required');
  });

  it('fails the first start request in the retry preview', async () => {
    const { fetch } = backend('oto', 'error');
    const path =
      '/backend/widget/v5/connections/11111111-1111-4111-8111-111111111111/start';
    expect((await post(fetch, path, {})).status).toBe(503);
    expect((await post(fetch, path, {})).status).toBe(201);
  });

  it('mints a fresh request after the expired-request continuation', async () => {
    const { fetch } = backend('oto', 'reconnect');
    const sessionId = await createSession(fetch);
    const initial = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '99999999-9999-4999-8999-999999999998',
      content: preview.questions.oto,
    });
    expect(await initial.text()).toContain(
      '33333333-3333-4333-8333-000000000001',
    );
    const startPath =
      '/backend/widget/v5/connections/11111111-1111-4111-8111-111111111111/start';
    expect((await post(fetch, startPath, {})).status).toBe(410);

    const response = await post(fetch, '/backend/widget/v5/chat/stream', {
      session_id: sessionId,
      uuid: '99999999-9999-4999-8999-999999999999',
      content:
        'The connection request for OTO expired. Please create a new authorized connection request for OTO and continue my previous request.',
    });
    expect(await response.text()).toContain(
      '33333333-3333-4333-8333-000000000002',
    );
    expect((await post(fetch, startPath, {})).status).toBe(201);
  });
});

describe('preview parameters', () => {
  it('falls back to safe examples for unknown values', () => {
    expect(parsePreviewMode('unknown')).toBe('oto');
    expect(parsePreviewState('unknown')).toBe('idle');
  });

  it('reset clears preview state without touching host-page storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(preview.storageKeys.connected('oto'), 'true');
    storage.setItem(preview.storageKeys.attempt('attempt-1'), 'failed');
    storage.setItem('host-preference', 'kept');

    clearPreviewState(storage, 'oto');

    expect(storage.getItem(preview.storageKeys.connected('oto'))).toBeNull();
    expect(
      storage.getItem(preview.storageKeys.attempt('attempt-1')),
    ).toBeNull();
    expect(storage.getItem('host-preference')).toBe('kept');
  });
});
