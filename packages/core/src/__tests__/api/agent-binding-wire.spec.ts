// NOTE: deliberately does NOT import api-caller.mock — this spec exercises the
// REAL ApiCaller so the assertions cover the actual wire format (query string +
// POST body), which the mocked-ApiCaller specs cannot prove.
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';

const AGENT_ID = 'e82b4a75-20d6-4258-ac1f-4ee206000000';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

suite('agent binding — wire format (real ApiCaller, stubbed fetch)', () => {
  let requests: Array<{ url: string; method: string; body: string | null }>;

  beforeEach(() => {
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({
          url: request.url,
          method: request.method,
          body: request.method === 'POST' ? await request.text() : null,
        });
        return jsonResponse({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('config GET carries ?agentId= when bound, and omits it when not', async () => {
    const bound = new ApiCaller({ config: { token: 'tok', agentId: AGENT_ID } });
    await bound.getExternalWidgetConfig();
    const boundUrl = requests.at(-1)?.url ?? '';
    expect(boundUrl).toContain('/backend/widget/v2/config');
    expect(boundUrl).toContain(`agentId=${AGENT_ID}`);

    const unbound = new ApiCaller({ config: { token: 'tok' } });
    await unbound.getExternalWidgetConfig();
    expect(requests.at(-1)?.url).not.toContain('agentId');
  });

  test('create-session POST body carries agentId verbatim', async () => {
    const api = new ApiCaller({ config: { token: 'tok', agentId: AGENT_ID } });
    await api.createSession({ customData: undefined, agentId: AGENT_ID });

    const request = requests.at(-1);
    expect(request?.method).toBe('POST');
    expect(request?.url).toContain('/backend/widget/v2/create-session');
    const body: unknown = JSON.parse(request?.body ?? '{}');
    expect(body).toMatchObject({ agentId: AGENT_ID });
  });
});
