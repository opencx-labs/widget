import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium, firefox, webkit } from 'playwright';

const engine = process.env.WIDGET_TEST_BROWSER ?? 'chromium';
const fixture = JSON.parse(
  await readFile(process.env.WIDGET_LOCAL_IDENTITIES, 'utf8'),
);
const base = new URL(fixture.base);
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
assert.equal(base.protocol, 'http:');
const bundles = {
  v4: await readFile(
    new URL('../../../../local-pack/v4-upgrade/script.js', import.meta.url),
    'utf8',
  ),
  v5: await readFile(
    new URL('../../dist-embed/script.js', import.meta.url),
    'utf8',
  ),
};

test(
  `real local backend: v4 → v5 renewal, A → B → A (${engine})`,
  { timeout: 90000 },
  async (t) => {
    const browser = await { chromium, firefox, webkit }[engine].launch();
    let server;
    try {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      let version = 'v4';
      const errors = [];
      const sends = [];
      const [a, b] = fixture.identities;
      await context.addInitScript(
        (config) => {
          window.localConfig = config;
        },
        {
          token: a.botToken,
          apiUrl: base.origin,
          user: { token: a.token, externalId: 'local-a' },
          collectUserData: false,
          router: { chatScreenOnly: true },
          initialMessages: ['LOCAL WELCOME'],
          disableTooltips: true,
        },
      );
      server = createServer((request, response) => {
        if (request.url === '/script.js') {
          response.setHeader('content-type', 'application/javascript');
          return response.end(bundles[version]);
        }
        response.setHeader('content-type', 'text/html');
        response.end(
          '<!doctype html><html><body><script src="/script.js"></script><script>initOpenScript(window.localConfig);</script></body></html>',
        );
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const host = `http://127.0.0.1:${server.address().port}`;
      const publicHtml = await (await fetch(host)).text();
      assert.equal(
        [a.botToken, a.token, a.renewed, b.token, b.renewed].some((secret) =>
          publicHtml.includes(secret),
        ),
        false,
        'the fixture HTTP response must not expose local credentials',
      );
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (
          [base.origin, host].includes(url.origin) ||
          url.protocol === 'data:'
        )
          return route.continue();
        errors.push(
          `unexpected browser destination: ${url.origin}${url.pathname}`,
        );
        return route.abort();
      });
      async function newPage() {
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error')
            t.diagnostic(
              message.text().replace(/Bearer [^ ]+/g, 'Bearer [redacted]'),
            );
        });
        page.on('response', (response) => {
          if (response.status() >= 400)
            t.diagnostic(
              `HTTP ${response.status()} ${new URL(response.url()).pathname}`,
            );
        });
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.endsWith('/chat/send'))
            sends.push(request);
        });
        await page.goto(host);
        return page;
      }
      const frame = (page) =>
        page.frameLocator('iframe[title="OpenCX Live Chat"]');
      async function open(page) {
        if (errors.length) t.diagnostic(errors.join('\n'));
        await page
          .frameLocator('iframe[title="OpenCX Live Chat Trigger"]')
          .locator('button')
          .click();
        await frame(page).locator('[data-component="chat/header"]').waitFor();
      }
      async function switchTo(page, identity, externalId, renewed = false) {
        await page.evaluate(
          ({ identity, externalId, renewed }) => {
            window.localConfig = {
              ...window.localConfig,
              user: {
                token: renewed ? identity.renewed : identity.token,
                externalId,
              },
            };
            window.initOpenScript(window.localConfig);
          },
          { identity, externalId, renewed },
        );
      }
      let page = await newPage();
      await open(page);
      const firstMarker = `V4 PRIVATE A ${crypto.randomUUID()}`;
      await frame(page).locator('textarea').fill(firstMarker);
      const firstSent = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith('/chat/send'),
      );
      await frame(page).locator('textarea').press('Enter');
      assert.equal((await firstSent).status(), 201);
      const sessionId = sends.at(-1).postDataJSON().session_id;
      await frame(page).getByText(firstMarker, { exact: true }).waitFor();
      await page.close();
      version = 'v5';
      page = await newPage();
      await open(page);
      await frame(page).getByText(firstMarker, { exact: true }).waitFor();
      await switchTo(page, a, 'local-a', true);
      await frame(page).getByText(firstMarker, { exact: true }).waitFor();
      const marker = `RENEWED LOCAL ${crypto.randomUUID()}`;
      const input = frame(page).locator('textarea');
      await input.fill(marker);
      const sent = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith('/chat/send'),
      );
      await input.press('Enter');
      assert.equal((await sent).status(), 201);
      assert.ok(
        (await sends.at(-1).allHeaders()).authorization ===
          `Bearer ${a.renewed}`,
        'renewed token authenticates the next send',
      );
      assert.equal(sends.at(-1).postDataJSON().session_id, sessionId);
      await switchTo(page, b, 'local-b');
      await open(page);
      await frame(page)
        .getByText('PRIVATE HISTORY B', { exact: true })
        .waitFor();
      assert.equal(
        await frame(page).getByText(firstMarker, { exact: true }).count(),
        0,
      );
      assert.equal(
        await frame(page).getByText(marker, { exact: true }).count(),
        0,
      );
      await switchTo(page, a, 'local-a', true);
      await open(page);
      await frame(page).getByText(marker, { exact: true }).waitFor();
      assert.equal(
        await frame(page)
          .getByText('PRIVATE HISTORY B', { exact: true })
          .count(),
        0,
      );
      await page.reload();
      await open(page);
      await frame(page).getByText(marker, { exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    }
  },
);
