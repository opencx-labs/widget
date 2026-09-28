import { afterEach, expect, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const url = `http://localhost:8080/backend/widget/v5/workspace/${sessionId}/files/${fileId}`;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('fetches a private report using the latest token without redirects, cookies or URL credentials', async () => {
  const api = new ApiCaller({
    config: { token: 'org-token', user: { token: 'old-token' } },
  });
  const fetcher = vi.fn(
    async () =>
      new Response('private report', {
        headers: {
          'content-disposition':
            "attachment; filename*=UTF-8''monthly%20report.csv",
        },
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  api.setAuthToken('renewed-token');
  const signal = new AbortController().signal;
  const report = await api.downloadWorkspaceFile(url, sessionId, signal);
  expect(await report.blob.text()).toBe('private report');
  expect(report.name).toBe('monthly report.csv');
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(url, {
    headers: {
      'X-Bot-Token': 'org-token',
      Authorization: 'Bearer renewed-token',
    },
    signal,
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
  });
});

test('refuses arbitrary destinations, altered paths and a different session before sending credentials', async () => {
  const api = new ApiCaller({
    config: { token: 'org-token', user: { token: 'secret' } },
  });
  const fetcher = vi.fn(async () => new Response('ok'));
  vi.stubGlobal('fetch', fetcher);
  for (const href of [
    url.replace('localhost:8080', 'evil.example'),
    url.replace('http:', 'https:'),
    url.replace('localhost:8080', 'localhost:8080.evil.example'),
    url.replace('localhost:8080', 'secret@localhost:8080'),
    `${url}?redirect=https://evil.example`,
    `${url}#secret`,
    `${url}/extra`,
    url.replace('/files/', '/%66iles/'),
    url.replace(sessionId, fileId),
    'javascript:alert(1)',
    '/backend/widget/v5/workspace/report',
  ]) {
    await expect(
      api.downloadWorkspaceFile(href, sessionId, new AbortController().signal),
    ).rejects.toThrow('not available');
  }
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    api.downloadWorkspaceFile(url, sessionId, new AbortController().signal),
  ).resolves.toHaveProperty('blob');
  expect(fetcher).toHaveBeenCalledOnce();
});

test('rejects expired authentication and discards bytes after cancellation or token changes', async () => {
  const api = new ApiCaller({
    config: { token: 'org-token', user: { token: 'a' } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('expired', { status: 401 })),
  );
  await expect(
    api.downloadWorkspaceFile(url, sessionId, new AbortController().signal),
  ).rejects.toThrow('Sign in again');
  for (const change of ['abort', 'token']) {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (change === 'abort') controller.abort();
        else api.setAuthToken('b');
        return new Response('must not download');
      }),
    );
    await expect(
      api.downloadWorkspaceFile(url, sessionId, controller.signal),
    ).rejects.toThrow();
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('current')),
  );
  expect(
    await (
      await api.downloadWorkspaceFile(
        url,
        sessionId,
        new AbortController().signal,
      )
    ).blob.text(),
  ).toBe('current');
});

test('supports a custom API origin without sending credentials to the default origin', async () => {
  vi.stubEnv('MODE', 'production');
  const api = new ApiCaller({
    config: {
      token: 'org',
      apiUrl: 'https://support.example/proxy/',
      user: { token: 'user' },
    },
  });
  expect(api.workspaceDownloadFromUrl(url)).toBeNull();
  const own = url.replace(
    'http://localhost:8080',
    'https://support.example/proxy',
  );
  expect(api.workspaceDownloadFromUrl(own)).toEqual({ sessionId, fileId });
});
