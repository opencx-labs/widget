import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEMO_MERCHANT, issueWidgetIdentity } from './widget-identity.mjs';

const configFile = (value) => {
  const path = join(mkdtempSync(join(tmpdir(), 'payla-identity-')), 'c.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
};
const validConfig = () =>
  configFile({ apiKey: 'server-only-key', serverIds: ['linear', 'lab'] });
const quiet = { error() {} };
const signedIn = async (init) => ({
  ok: true,
  status: 201,
  json: async () => ({ token: 'user-token', contact: { id: 'contact-1' } }),
  init,
});
const localRequest = {
  method: 'POST',
  host: 'localhost:5173',
  origin: 'http://localhost:5173',
};

test('signs the demo merchant in with their connections, key stays server-side', async () => {
  const calls = [];
  const result = await issueWidgetIdentity({
    ...localRequest,
    env: { PAYLA_IDENTITY_CONFIG: validConfig() },
    logger: quiet,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return signedIn(init);
    },
  });
  assert.deepEqual(result, {
    status: 200,
    body: { token: 'user-token', externalId: 'contact-1' },
  });
  assert.equal(JSON.stringify(result.body).includes('server-only-key'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:8080/widget/authenticate-user');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer server-only-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    name: DEMO_MERCHANT.name,
    email: DEMO_MERCHANT.email,
    mcp_access: { server_ids: ['linear', 'lab'], account_id: 'org_payla_demo' },
  });
});

test('follows VITE_OPENCX_API_URL like the widget does', async () => {
  let seenUrl;
  const result = await issueWidgetIdentity({
    ...localRequest,
    env: {
      PAYLA_IDENTITY_CONFIG: validConfig(),
      VITE_OPENCX_API_URL: 'http://127.0.0.1:8187/',
    },
    logger: quiet,
    fetchImpl: async (url, init) => {
      seenUrl = url;
      return signedIn(init);
    },
  });
  assert.equal(result.status, 200);
  assert.equal(seenUrl, 'http://127.0.0.1:8187/widget/authenticate-user');
});

test('refuses cross-origin, non-local and non-POST callers without calling the backend', async () => {
  const env = { PAYLA_IDENTITY_CONFIG: validConfig() };
  for (const request of [
    { ...localRequest, origin: 'http://evil.example' },
    { ...localRequest, origin: undefined },
    { method: 'POST', host: 'payla.example', origin: 'http://payla.example' },
    { ...localRequest, method: 'GET' },
  ]) {
    let called = false;
    const result = await issueWidgetIdentity({
      ...request,
      env,
      logger: quiet,
      fetchImpl: async (_url, init) => {
        called = true;
        return signedIn(init);
      },
    });
    assert.equal(result.status, 403, JSON.stringify(request));
    assert.equal(called, false);
  }
  // Positive control: the same env and fetch succeed from the local page.
  const ok = await issueWidgetIdentity({
    ...localRequest,
    env,
    logger: quiet,
    fetchImpl: signedIn,
  });
  assert.equal(ok.status, 200);
});

test('a missing or malformed config explains the seed instead of throwing', async () => {
  for (const path of [
    join(tmpdir(), 'payla-identity-does-not-exist.json'),
    configFile({ apiKey: 'k' }),
  ]) {
    const errors = [];
    const result = await issueWidgetIdentity({
      ...localRequest,
      env: { PAYLA_IDENTITY_CONFIG: path },
      logger: { error: (...args) => errors.push(args) },
      fetchImpl: signedIn,
    });
    assert.equal(result.status, 503);
    assert.match(result.body.message, /seed-payla-connections/);
    assert.equal(errors.length, 1);
  }
});

test('a backend rejection or unexpected body is a 503, never a token', async () => {
  for (const response of [
    { ok: false, status: 401, json: async () => ({}) },
    { ok: true, status: 201, json: async () => ({ token: 'user-token' }) },
  ]) {
    const result = await issueWidgetIdentity({
      ...localRequest,
      env: { PAYLA_IDENTITY_CONFIG: validConfig() },
      logger: quiet,
      fetchImpl: async () => response,
    });
    assert.equal(result.status, 503);
    assert.equal('token' in result.body, false);
  }
});
