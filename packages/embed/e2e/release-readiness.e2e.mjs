import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

let browser, bundle;
before(async () => {
  bundle = await readFile(
    new URL('../dist-embed/script.js', import.meta.url),
    'utf8',
  );
  const engine = process.env.WIDGET_TEST_BROWSER ?? 'chromium';
  assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
  browser = await { chromium, firefox, webkit }[engine].launch();
});
after(async () => browser?.close());

async function fixture(t, options = {}, reducedMotion = 'no-preference') {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion,
    serviceWorkers: 'block',
  });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const requests = [],
    unexpected = [],
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (
      msg.type() === 'error' &&
      /createRoot|Invalid hook|React error|Content Security Policy/i.test(
        msg.text(),
      )
    )
      errors.push(msg.text());
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
  let sends = 0;
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
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
        // A concrete CSP allowing the classic script and authored styles. No
        // dynamic script chunks, eval, cross-origin connections, or live images.
        headers: {
          'Content-Security-Policy':
            "default-src 'none'; script-src 'self' 'nonce-fixture'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' about:; font-src data:;",
        },
        body: `<!doctype html><html><body><script src="/script.js"></script><script nonce="fixture">window.fixtureOptions=${JSON.stringify({ token: 'fixture-bot', apiUrl: 'https://fixture.test', language: 'en', collectUserData: false, ...options }).replace(/</g, '\\u003c')};initOpenScript(window.fixtureOptions);</script></body></html>`,
      });
    if (url.pathname === '/script.js')
      return route.fulfill({
        contentType: 'application/javascript',
        body: bundle,
      });
    requests.push({
      path: url.pathname,
      headers: req.headers(),
      body: req.headers()['content-type']?.includes('application/json')
        ? req.postDataJSON()
        : req.postData(),
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
            dictation: true,
            attachments: true,
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
    if (url.pathname === '/backend/widget/v2/poll/fixture-session')
      return json({ session, history: [] });
    if (url.pathname === '/backend/widget/v2/upload')
      return json({
        fileName: 'fixture.pdf',
        fileUrl: 'https://fixture.test/files/fixture.pdf',
      });
    if (url.pathname === '/backend/widget/v5/dictation/sessions')
      return json({
        token: 'synthetic-ephemeral',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        model: 'fixture',
      });
    if (url.pathname === '/backend/widget/v2/chat/send')
      return json({
        success: true,
        autopilotResponse: {
          type: 'text',
          value: { error: false, content: `FIXTURE_REPLY_${++sends}` },
          id: `fixture-reply-${sends}`,
          mightSolveUserIssue: false,
          completelyAndFullyCoveredUserIssue: false,
          assistMode: false,
        },
      });
    unexpected.push(url.pathname);
    return route.fulfill({ status: 404, body: '{}' });
  });
  t.after(() => {
    assert.deepEqual(unexpected, [], 'no unexpected/live requests');
    assert.deepEqual(errors, [], 'no browser/React/CSP errors');
  });
  await page.goto('https://fixture.test/');
  const frame = page.frameLocator('iframe[title="OpenCX Live Chat"]');
  async function open() {
    if (options.displayMode === 'companion')
      await page.locator('[data-companion-launcher]').click();
    else
      await page
        .frameLocator('iframe[title="OpenCX Live Chat Trigger"]')
        .locator('button')
        .click();
  }
  return { page, frame, requests, open };
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  for (const required of [false, true]) {
    test(
      `Companion: required=${required}, motion=${reducedMotion}, footer and first send`,
      { timeout: 30000 },
      async (t) => {
        // Exercise the original zero-height failure without a footer to prop
        // the shell open; the other cases verify the configured notice.
        const showFooter = !required || reducedMotion !== 'reduce';
        const { page, frame, requests, open } = await fixture(
          t,
          {
            displayMode: 'companion',
            requireInitialQuestion: required,
            initialQuestions: ['First question', 'Second question'],
            chatFooterItems: showFooter
              ? [
                  {
                    message:
                      'Read our [privacy notice](https://fixture.test/privacy)',
                  },
                ]
              : [],
          },
          reducedMotion,
        );
        await open();
        if (showFooter)
          await frame.getByRole('link', { name: 'privacy notice' }).waitFor();
        // Measure the CLIPPING shell, not the deliberately chat-tall iframe.
        await page.waitForFunction(() => {
          const iframe = document.querySelector(
            'iframe[title="OpenCX Live Chat"]',
          );
          const shell = iframe?.parentElement?.parentElement;
          return shell && shell.getBoundingClientRect().height > 40;
        });
        if (required) {
          assert.equal(await frame.locator('textarea').count(), 0);
          assert.equal(
            await page.locator('iframe[title="Suggested questions"]').count(),
            0,
          );
          // Visible pointer dismissal remains possible before selecting a question.
          await frame
            .getByRole('button', { name: 'Close', exact: true })
            .click();
          await page.locator('[data-companion-launcher]').waitFor();
          await open();
          await frame
            .getByRole('button', { name: 'First question', exact: true })
            .click();
        } else {
          await frame.locator('textarea').waitFor();
          await page
            .frameLocator('iframe[title="Suggested questions"]')
            .getByRole('button', { name: 'First question', exact: true })
            .click();
        }
        await frame.getByText('FIXTURE_REPLY_1', { exact: true }).waitFor();
        await frame.locator('textarea').pressSequentially('Follow up');
        await frame.locator('textarea').press('Enter');
        await frame.getByText('FIXTURE_REPLY_2', { exact: true }).waitFor();
        const sends = requests.filter((r) => r.path.endsWith('/chat/send'));
        assert.equal(sends[0].body.content, 'First question');
        assert.equal(sends[1].body.content, 'Follow up');
        assert.equal(sends[0].body.features.page_context, false);
        assert.equal(sends[0].body.features.client_tools, false);
      },
    );
  }
}

test(
  'duplicate classic script preserves a live conversation and draft under CSP',
  { timeout: 30000 },
  async (t) => {
    const { page, frame, requests, open } = await fixture(t);
    await open();
    await frame.locator('textarea').pressSequentially('First message');
    await frame.locator('textarea').press('Enter');
    await frame.getByText('FIXTURE_REPLY_1', { exact: true }).waitFor();
    await frame
      .locator('textarea')
      .pressSequentially('Draft after reinjection');
    await page.evaluate(() => {
      window.fixtureFirstInit = window.initOpenScript;
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/script.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    });
    assert.ok(
      await page.evaluate(
        () => window.fixtureFirstInit === window.initOpenScript,
      ),
    );
    await page.evaluate(() => window.initOpenScript(window.fixtureOptions));
    assert.equal(await page.locator('#opencx-root').count(), 1);
    assert.equal(
      await frame.locator('textarea').inputValue(),
      'Draft after reinjection',
    );
    await frame.locator('textarea').press('Enter');
    await frame.getByText('FIXTURE_REPLY_2', { exact: true }).waitFor();
    assert.equal(
      requests.filter((r) => r.path.endsWith('/create-session')).length,
      1,
    );
  },
);

test(
  'upload uses authenticated multipart v2 and sends attachment metadata',
  { timeout: 30000 },
  async (t) => {
    const { frame, requests, open } = await fixture(t);
    await open();
    await frame.locator('input[type="file"]').setInputFiles({
      name: 'fixture.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nSynthetic fixture\n%%EOF'),
    });
    const send = frame.getByRole('button', {
      name: 'Send message',
      exact: true,
    });
    // The button is disabled while upload is in flight; click waits for readiness.
    await send.click();
    await frame.getByText('FIXTURE_REPLY_1', { exact: true }).waitFor();
    const upload = requests.find((r) => r.path.endsWith('/upload'));
    assert.equal(upload.headers.authorization, 'Bearer fixture-contact');
    assert.equal(upload.headers['x-bot-token'], 'fixture-bot');
    assert.match(
      upload.headers['content-type'],
      /^multipart\/form-data; boundary=/,
    );
    assert.match(upload.body, /filename="fixture.pdf"/);
    const attachment = requests.find((r) => r.path.endsWith('/chat/send')).body
      .attachments[0];
    assert.equal(attachment.url, 'https://fixture.test/files/fixture.pdf');
    assert.equal(attachment.name, 'fixture.pdf');
    assert.equal(attachment.type, 'application/pdf');
  },
);

test(
  'microphone denial shows an error and leaves typing usable without calling the provider',
  { timeout: 30000 },
  async (t) => {
    const { page, frame, open } = await fixture(t, {
      features: { dictation: true },
    });
    // The widget executes in the host realm; no actual device or API key is used.
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () =>
            Promise.reject(
              new DOMException('Synthetic denial', 'NotAllowedError'),
            ),
        },
      }),
    );
    await open();
    await frame
      .locator('[data-component="chat/input_box/dictate_btn"]')
      .click();
    await frame
      .getByText('Allow microphone access to dictate', { exact: true })
      .waitFor();
    await frame.locator('textarea').pressSequentially('Typed after denial');
    await frame.locator('textarea').press('Enter');
    await frame.getByText('FIXTURE_REPLY_1', { exact: true }).waitFor();
  },
);

test(
  'mint failure stops an already-granted microphone',
  { timeout: 30000 },
  async (t) => {
    const { page, frame, open } = await fixture(t, {
      features: { dictation: true },
    });
    await page.evaluate(() => {
      window.fixtureMicGrants = 0;
      window.fixtureMicStops = 0;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            window.fixtureMicGrants++;
            return {
              getTracks: () => [{ stop: () => window.fixtureMicStops++ }],
            };
          },
        },
      });
    });
    let resolveMint;
    const requestedMint = new Promise((resolve) => {
      resolveMint = resolve;
    });
    await page.route('**/backend/widget/v5/dictation/sessions', (route) =>
      resolveMint(route),
    );
    await open();
    await frame
      .locator('[data-component="chat/input_box/dictate_btn"]')
      .click();
    await page.waitForFunction(() => window.fixtureMicGrants > 0);
    const mintRoute = await requestedMint;
    await mintRoute.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{}',
    });
    await frame
      .getByText('Dictation is unavailable right now', { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.fixtureMicStops),
      1,
      'granted track must stop after mint failure',
    );
  },
);
