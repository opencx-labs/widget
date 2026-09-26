import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fixtureHtml } from './fixtures/public-setups.mjs';

let browser;
let bundle;
before(async () => {
  bundle = await readFile(
    new URL('../dist-embed/script.js', import.meta.url),
    'utf8',
  );
  browser = await chromium.launch();
});
after(async () => browser?.close());

async function eventually(check) {
  const deadline = Date.now() + 10000;
  let error;
  do {
    try {
      await check();
      return;
    } catch (e) {
      error = e;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw error;
}

for (const name of ['trunkrs', 'deonlinedrogist', 'qoyod']) {
  for (const mobile of [false, true]) {
    test(
      `${name}: ${mobile ? 'mobile' : 'desktop'} open, send, close and reopen`,
      { timeout: 45000 },
      async () => {
        const context = await browser.newContext({
          viewport: mobile
            ? { width: 390, height: 844 }
            : { width: 1280, height: 900 },
          reducedMotion: 'no-preference',
          serviceWorkers: 'block',
        });
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(10000);
          const errors = [],
            requests = [],
            unexpected = [];
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('console', (msg) => {
            if (
              msg.type() === 'error' &&
              /createRoot|Invalid hook|React error/i.test(msg.text())
            )
              errors.push(msg.text());
          });
          await page.addInitScript(() => {
            let init;
            window.fixtureConfigs = [];
            Object.defineProperty(window, 'initOpenScript', {
              configurable: true,
              get: () => init,
              set: (fn) => {
                init = (options) => {
                  window.fixtureConfigs.push(options);
                  return fn({ ...options, apiUrl: location.origin });
                };
              },
            });
          });
          const session = {
            id: 'fixture-session',
            ticketNumber: 1,
            title: null,
            assignee: { kind: 'ai', name: null, avatarUrl: null },
            channel: 'web',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            isHandedOff: false,
            isOpened: true,
            isVerified: false,
            lastMessage: '',
            latestStateCheckpointPayload: null,
            modeId: null,
            sessionAttributes: {},
            customStatus: null,
          };
          await context.route('**/*', async (route) => {
            const request = route.request(),
              url = new URL(request.url());
            const json = (body) =>
              route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(body),
              });
            if (url.origin !== 'https://fixture.test') {
              unexpected.push(url.origin + url.pathname);
              return route.abort();
            }
            if (url.pathname === '/')
              return route.fulfill({
                contentType: 'text/html',
                body: fixtureHtml(name, mobile ? 'JO' : 'SA'),
              });
            if (url.pathname === '/script.js')
              return route.fulfill({
                contentType: 'application/javascript',
                body: bundle,
              });
            if (url.pathname === '/avatar.svg')
              return route.fulfill({
                contentType: 'image/svg+xml',
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="gray"/></svg>',
              });
            requests.push({
              path: url.pathname,
              body: request.postDataJSON(),
              token: request.headers()['x-bot-token'],
            });
            if (url.pathname === '/backend/widget/v2/config')
              return json({
                org: { id: 'fixture-org', name: 'Fixture' },
                modes: [],
                sessionsPollingIntervalSeconds: 3600,
                sessionPollingIntervalSeconds: 3600,
                agent: {
                  name: 'Fixture agent',
                  avatar_url: null,
                  streaming: true,
                  features: {
                    preamble: false,
                    inline_ui: false,
                    dictation: false,
                    attachments: false,
                    page_context: true,
                    client_tools: true,
                  },
                },
              });
            if (url.pathname === '/backend/widget/v2/contact/create-unverified')
              return json({ token: 'fixture-contact' });
            if (url.pathname === '/backend/widget/v2/sessions')
              return json({ items: [], next: null });
            if (url.pathname === '/backend/widget/v2/create-session')
              return json(session);
            if (url.pathname === '/backend/widget/v2/chat/send')
              return json({
                success: true,
                autopilotResponse: {
                  type: 'text',
                  value: { error: false, content: 'LOCAL_COMPAT_REPLY' },
                  id: 'fixture-reply',
                  mightSolveUserIssue: false,
                  completelyAndFullyCoveredUserIssue: false,
                  assistMode: false,
                },
              });
            if (url.pathname === '/backend/widget/v2/poll/fixture-session')
              return json({ session, history: [] });
            unexpected.push(url.pathname);
            return route.fulfill({ status: 404, body: '{}' });
          });
          await page.goto('https://fixture.test/');
          const trigger = page.frameLocator(
            'iframe[title="OpenCX Live Chat Trigger"]',
          );
          const frame = page.frameLocator('iframe[title="OpenCX Live Chat"]');
          if (name === 'trunkrs') await trigger.locator('button').click();
          else await page.locator('.j-chat-link').click();
          await eventually(async () => {
            const visible = await page
              .locator('iframe[title="OpenCX Live Chat"]')
              .evaluate((f) => {
                const r = f.getBoundingClientRect(),
                  s = getComputedStyle(f.parentElement);
                return (
                  r.width > 80 &&
                  r.height > 80 &&
                  Number(s.opacity) > 0.95 &&
                  s.display !== 'none'
                );
              });
            assert.ok(
              visible,
              'panel must actually paint after customer launcher',
            );
          });
          if (name === 'trunkrs') {
            await frame.locator('input[name="name"]').fill('Synthetic Visitor');
            await frame
              .locator('input[name="email"]')
              .fill('visitor@example.invalid');
            await frame
              .locator('input[placeholder^="Trunkrs-nummer"]')
              .fill('41000000');
            await frame
              .locator('input[placeholder^="Post code"]')
              .fill('0000AA');
            await frame.locator('form button').click();
          }
          await frame.locator('textarea').fill('Local compatibility test');
          await frame.locator('textarea').press('Enter');
          await frame
            .getByText('LOCAL_COMPAT_REPLY', { exact: true })
            .waitFor();
          const send = requests.find(
            (r) => r.path === '/backend/widget/v2/chat/send',
          );
          assert.ok(send, 'legacy send endpoint must remain the default');
          assert.equal(send.body.features.page_context, false);
          assert.equal(send.body.features.client_tools, false);
          if (name === 'trunkrs') {
            assert.ok(send.body.content.includes('41000000'));
            assert.ok(send.body.content.includes('0000AA'));
          }
          assert.equal(send.body.capabilities.connections, false);
          if (name === 'deonlinedrogist')
            assert.deepEqual(send.body.clientContext?.category, {
              id: 0,
              name: 'Homepagina',
            });
          if (name === 'qoyod') {
            assert.equal(
              await page.evaluate(() => window.fixtureConfigs[0].token),
              mobile ? 'fixture-jo' : 'fixture-sa',
            );
            assert.equal(
              await frame
                .locator('textarea')
                .evaluate((el) => getComputedStyle(el).direction),
              'rtl',
            );
          }
          if (mobile)
            await frame
              .locator(
                '[data-component="chat/header"] button:has(svg.lucide-x)',
              )
              .click();
          else await trigger.locator('button').click();
          await eventually(async () => {
            assert.equal(
              await page
                .locator('iframe[title="OpenCX Live Chat"]')
                .evaluate((f) => getComputedStyle(f.parentElement).display),
              'none',
            );
          });
          if (name === 'trunkrs') await trigger.locator('button').click();
          else await page.locator('.j-chat-link').click();
          await frame
            .getByText('LOCAL_COMPAT_REPLY', { exact: true })
            .waitFor();
          assert.equal(
            new URL(page.url()).pathname,
            '/',
            'customer fallback must not navigate away',
          );
          // Let Qoyod's delayed nudge and 500ms close reconciliation both run.
          // Checking only immediately after reopen would miss a stale hide timer.
          if (name === 'qoyod') await page.waitForTimeout(800);
          await eventually(async () =>
            assert.ok(
              await page
                .locator('iframe[title="OpenCX Live Chat"]')
                .evaluate((f) => {
                  const s = getComputedStyle(f.parentElement);
                  return s.display !== 'none' && Number(s.opacity) > 0.95;
                }),
              'reopened panel must remain painted after customer timers settle',
            ),
          );
          assert.equal(await page.locator('#opencx-root').count(), 1);
          assert.deepEqual(
            unexpected,
            [],
            'fixture must not call live services or unexpected routes',
          );
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      },
    );
  }
}
