// NOTE: deliberately does NOT import api-caller.mock — this spec exercises the
// REAL ApiCaller so the assertions cover the actual wire format (query string +
// POST body), which the mocked-ApiCaller specs cannot prove.
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

suite('widget API — wire format (real ApiCaller, stubbed fetch)', () => {
  let requests: Array<{ url: string; method: string; body: string | null }>;
  /** The next response the stubbed fetch returns (then back to `{}`). */
  let nextResponse: Response | null;

  beforeEach(() => {
    requests = [];
    nextResponse = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        requests.push({
          url: request.url,
          method: request.method,
          body: request.method === 'POST' ? await request.text() : null,
        });
        const response = nextResponse ?? jsonResponse({});
        nextResponse = null;
        return response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('config GET carries no query string at all', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    await api.getExternalWidgetConfig();
    const url = requests.at(-1)?.url ?? '';
    expect(url).toContain('/backend/widget/v2/config');
    expect(url).not.toContain('?');
  });

  test('sessions GET carries only offset + filters', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    await api.getSessions({ cursor: '20', filters: { a: 'b' } });
    const url = new URL(requests.at(-1)?.url ?? 'http://x');
    expect(url.pathname).toBe('/backend/widget/v2/sessions');
    expect(Array.from(url.searchParams.keys()).sort()).toEqual([
      'filters',
      'offset',
    ]);
  });

  test('create-session POST body carries only customData', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    await api.createSession({ customData: { plan: 'pro' } });

    const request = requests.at(-1);
    expect(request?.method).toBe('POST');
    expect(request?.url).toContain('/backend/widget/v2/create-session');
    const body: unknown = JSON.parse(request?.body ?? '{}');
    expect(body).toEqual({ customData: { plan: 'pro' } });
  });

  test('v5 stop is a bare POST on the session path', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    await api.stopStream('s/1');
    const request = requests.at(-1);
    expect(request?.method).toBe('POST');
    expect(request?.url).toContain('/backend/widget/v5/chat/s%2F1/stop');
  });

  test('v5 turn messages GET returns the wire payload, null on failure', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    nextResponse = jsonResponse({
      turns: [{ turn_id: 't1', ui_parts: null, message_uuids: ['m1'] }],
    });
    await expect(api.getAgentTurnMessages('s1')).resolves.toEqual({
      turns: [{ turn_id: 't1', ui_parts: null, message_uuids: ['m1'] }],
    });
    expect(requests.at(-1)?.url).toContain(
      '/backend/widget/v5/chat/s1/messages',
    );

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    nextResponse = new Response('nope', { status: 500 });
    await expect(api.getAgentTurnMessages('s1')).resolves.toBeNull();
  });

  test('v5 dictation mint POSTs the language and throws on failure', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    nextResponse = jsonResponse({ token: 'ek', expiresAt: 'x', model: 'm' });
    await expect(
      api.createDictationSession({ language: 'de' }),
    ).resolves.toEqual({ token: 'ek', expiresAt: 'x', model: 'm' });
    const request = requests.at(-1);
    expect(request?.url).toContain('/backend/widget/v5/dictation/sessions');
    expect(JSON.parse(request?.body ?? '{}')).toEqual({ language: 'de' });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    nextResponse = new Response('nope', { status: 403 });
    await expect(api.createDictationSession({})).rejects.toThrow(
      'Failed to start dictation: 403',
    );
  });
});
