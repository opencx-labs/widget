// Real ApiCaller, stubbed fetch: a rejected contact token (401) must reach the
// widget context so a live tab can recover, while the contact-mint call — the
// one request that never carries a contact token — must stay silent.
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';

const respond = (status: number) =>
  new Response(status === 204 ? null : '{}', {
    status,
    headers: { 'content-type': 'application/json' },
  });

suite('ApiCaller — rejected contact token', () => {
  let status: number;
  let seen: string[];
  beforeEach(() => {
    status = 200;
    seen = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        seen.push(request.url);
        // `Response.url` is read-only; mirror the request URL the way fetch does.
        const response = respond(status);
        Object.defineProperty(response, 'url', { value: request.url });
        return response;
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  test('a 401 on a contact-scoped call reports once per response', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    const onUnauthorized = vi.fn();
    api.onUnauthorized = onUnauthorized;
    status = 401;
    await api.getSessions({ cursor: '0', filters: {} });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    // Positive control: the same call with a 200 stays quiet.
    status = 200;
    await api.getSessions({ cursor: '0', filters: {} });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('the contact mint call never reports, even on 401', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    const onUnauthorized = vi.fn();
    api.onUnauthorized = onUnauthorized;
    status = 401;
    await api.createUnverifiedContact({}).catch(() => undefined);
    expect(seen.at(-1)).toContain('/contact/create-unverified');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  test('connection routes never report: they refuse every anonymous visitor', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    const onUnauthorized = vi.fn();
    api.onUnauthorized = onUnauthorized;
    status = 401;
    await api.listConnections().catch(() => undefined);
    await api.listApprovalPreferences().catch(() => undefined);
    await api.listElicitations('s1').catch(() => undefined);
    expect(seen.filter((u) => u.includes('/v5/connections'))).toHaveLength(3);
    expect(onUnauthorized).not.toHaveBeenCalled();
    // Positive control on the same stub: a chat route still reports.
    await api.getSessions({ cursor: '0', filters: {} });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('the stream fetch reports a 401 like the typed client', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    const onUnauthorized = vi.fn();
    api.onUnauthorized = onUnauthorized;
    status = 401;
    const response = await api.streamFetch(
      'http://localhost:8080/backend/widget/v5/chat/stream',
      { method: 'POST' },
    );
    expect(response.status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    status = 200;
    await api.streamFetch(
      'http://localhost:8080/backend/widget/v5/chat/stream',
    );
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('without a handler a 401 is just the response', async () => {
    const api = new ApiCaller({ config: { token: 'tok' } });
    status = 401;
    await expect(
      api.streamFetch('http://localhost:8080/backend/widget/v5/chat/stream'),
    ).resolves.toMatchObject({ status: 401 });
  });
});
