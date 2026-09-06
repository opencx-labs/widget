import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBackend } from './check-backend.mjs';

const collect = () => {
  const lines = [];
  return {
    lines,
    logger: { log() {}, warn: (...a) => lines.push(a.join(' ')) },
  };
};

test('a seeded token on a running backend passes quietly', async () => {
  const seen = [];
  const { lines, logger } = collect();
  const ok = await checkBackend({
    env: {},
    logger,
    fetchImpl: async (url, init) => {
      seen.push([url, init.headers['X-Bot-Token']]);
      return { status: 200 };
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(lines, []);
  // The app's own default token, against the app's own default backend.
  assert.deepEqual(seen, [
    [
      'http://localhost:8080/backend/widget/v2/config',
      'opencx-local-companion-token',
    ],
  ]);
});

test('an unknown token names the seeds, in order', async () => {
  const { lines, logger } = collect();
  const ok = await checkBackend({
    env: {},
    logger,
    fetchImpl: async () => ({ status: 401 }),
  });
  assert.equal(ok, false);
  const text = lines.join('\n');
  assert.match(text, /does not know the widget token/);
  assert.ok(
    text.indexOf('seed-opencx-companion') <
      text.indexOf('seed-payla-demo') <
      text.indexOf('seed-payla-actions'),
  );
});

test('a backend that is not running says how to start it', async () => {
  const { lines, logger } = collect();
  const ok = await checkBackend({
    env: {},
    logger,
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(ok, false);
  assert.match(
    lines.join('\n'),
    /no OpenCX backend at http:\/\/localhost:8080/,
  );
  assert.match(lines.join('\n'), /pnpm ddev/);
});

test('env overrides win over the baked defaults', async () => {
  const seen = [];
  const { logger } = collect();
  await checkBackend({
    env: {
      VITE_OPENCX_WIDGET_TOKEN: 'other-token',
      VITE_OPENCX_API_URL: 'https://staging.example.com',
    },
    logger,
    fetchImpl: async (url, init) => {
      seen.push([url, init.headers['X-Bot-Token']]);
      return { status: 200 };
    },
  });
  assert.deepEqual(seen, [
    ['https://staging.example.com/backend/widget/v2/config', 'other-token'],
  ]);
});
