import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium, firefox, webkit } from 'playwright';
import { fixtureHtml } from './fixtures/public-setups.mjs';

const engine = process.env.WIDGET_TEST_BROWSER ?? 'chromium';
const bundle = await readFile(
  new URL('../dist-embed/script.js', import.meta.url),
  'utf8',
);

test(
  'rapid welcome → sessions → chat renders the current screen',
  { timeout: 60000 },
  async () => {
    const browser = await { chromium, firefox, webkit }[engine].launch();
    try {
      for (const delay of [0, 8, 25, 50]) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 900 },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => {
          let init;
          Object.defineProperty(window, 'initOpenScript', {
            get: () => init,
            set: (fn) => {
              init = (options) =>
                fn({
                  ...options,
                  apiUrl: location.origin,
                  hooks: {
                    onNavigateToChat: () => {
                      window.routedToChat = true;
                    },
                  },
                });
            },
          });
        });
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== 'https://fixture.test') return route.abort();
          if (url.pathname === '/')
            return route.fulfill({
              contentType: 'text/html',
              body: fixtureHtml('trunkrs', 'SA'),
            });
          if (url.pathname === '/script.js')
            return route.fulfill({
              contentType: 'application/javascript',
              body: bundle,
            });
          if (url.pathname === '/avatar.svg')
            return route.fulfill({
              contentType: 'image/svg+xml',
              body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
            });
          const json = (body) =>
            route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify(body),
            });
          if (url.pathname === '/backend/widget/v2/config')
            return json({
              org: { id: 'routing-org', name: 'Routing fixture' },
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
            return json({ token: 'routing-contact' });
          if (url.pathname === '/backend/widget/v2/sessions') {
            await new Promise((resolve) => setTimeout(resolve, delay));
            return json({ items: [], next: null });
          }
          errors.push(`Unexpected route: ${url.pathname}`);
          return route.fulfill({ status: 404, body: '{}' });
        });
        await page.goto('https://fixture.test');
        await page
          .frameLocator('iframe[title="OpenCX Live Chat Trigger"]')
          .locator('button')
          .click();
        const frame = page.frameLocator('iframe[title="OpenCX Live Chat"]');
        await page.waitForFunction(() => {
          const iframe = document.querySelector(
            'iframe[title="OpenCX Live Chat"]',
          );
          if (!iframe) return false;
          const box = iframe.getBoundingClientRect();
          return (
            box.width > 80 &&
            box.height > 80 &&
            Number(getComputedStyle(iframe.parentElement).opacity) > 0.95
          );
        });
        await frame
          .locator('input[name="name"]')
          .pressSequentially('Synthetic Visitor');
        await frame
          .locator('input[name="email"]')
          .pressSequentially('visitor@example.invalid');
        await frame
          .locator('input[placeholder^="Trunkrs-nummer"]')
          .pressSequentially('41000000');
        await frame
          .locator('input[placeholder^="Post code"]')
          .pressSequentially('0000AA');
        await frame.locator('form button').click();
        await page.waitForFunction(() => window.routedToChat === true);
        await frame
          .locator('textarea')
          .fill('The selected chat must be usable');
        assert.equal(
          await frame.locator('textarea').inputValue(),
          'The selected chat must be usable',
        );
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
