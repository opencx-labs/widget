import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { profiles, legacyConfig } from './upgrade/configs.mjs';
import { createBackend } from './upgrade/backend.mjs';

const engine = process.env.WIDGET_TEST_BROWSER ?? 'chromium';
const output =
  process.env.WIDGET_UPGRADE_OUTPUT ?? join(tmpdir(), 'widget-upgrade-results');
let browser, bundles;
before(async () => {
  bundles = {
    v4: await readFile(
      process.env.WIDGET_V4_BUNDLE ??
        new URL('../../../local-pack/v4-upgrade/script.js', import.meta.url),
      'utf8',
    ),
    v5: await readFile(
      new URL('../dist-embed/script.js', import.meta.url),
      'utf8',
    ),
  };
  browser = await { chromium, firefox, webkit }[engine].launch();
  await mkdir(`${output}/${engine}`, { recursive: true });
});
after(async () => browser?.close());

const component = (name) => `[data-component="${name}"]`;
async function fixture(t, profile, mobile, initialVersion = 'v4') {
  let version = initialVersion;
  const backend = createBackend(profile);
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  let page, frame, trigger;
  const errors = [];
  async function createPage() {
    page = await context.newPage();
    page.setDefaultTimeout(8000);
    const loadedVersion = version;
    page.on('pageerror', (e) => errors.push(`${loadedVersion}: ${e.message}`));
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        /createRoot|Invalid hook|React error/i.test(msg.text())
      )
        errors.push(`${loadedVersion}: ${msg.text()}`);
    });
    frame = page.frameLocator('iframe[title="OpenCX Live Chat"]');
    trigger = page.frameLocator('iframe[title="OpenCX Live Chat Trigger"]');
    await page.goto('https://upgrade.test/');
  }
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://upgrade.test') {
      backend.unexpected.push(url.origin + url.pathname);
      return route.abort();
    }
    if (url.pathname === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f3f4f6}#opencx-root{${profile === 'inline' ? 'width:100%;height:740px;' : ''}}</style></head><body><h1>Host page — ${profile}</h1><input value="HOST SECRET NEVER SHARE" type="password"><script src="/script.js"></script><script>window.legacyConfig=(${legacyConfig.toString()});window.upgradeConfig=legacyConfig(${JSON.stringify(profile)});initOpenScript(window.upgradeConfig);</script></body></html>`,
      });
    if (url.pathname === '/script.js')
      return route.fulfill({
        contentType: 'application/javascript',
        body: bundles[version],
      });
    if (url.pathname.endsWith('.svg'))
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="#ea580c"/></svg>',
      });
    return backend.route(route, version);
  });
  async function open() {
    if (profile !== 'inline') {
      if (profile === 'custom-trigger')
        await page.locator('[data-upgrade="trigger"]').click();
      else await trigger.locator('button').click();
    }
    await frame.locator('body').waitFor();
    // Real pointer tests start after the opening transition. Two stable
    // bounding-box samples alone can land before Framer's first frame.
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[title="OpenCX Live Chat"]');
      if (!iframe) return false;
      for (const element of [
        iframe,
        iframe.contentDocument?.querySelector(
          '[data-component="chat/header"], [data-component="sessions/header"], form',
        ) ?? iframe.contentDocument?.body,
      ]) {
        if (!element) return false;
        let node = element;
        while (node) {
          const style = node.ownerDocument.defaultView.getComputedStyle(node);
          if (
            Number(style.opacity) < 0.99 ||
            style.display === 'none' ||
            style.visibility === 'hidden'
          )
            return false;
          node = node.parentElement;
        }
      }
      return true;
    });
  }
  async function enterChat(warm = false) {
    await open();
    if (profile === 'brand-form') {
      await frame.getByText('CUSTOM WELCOME', { exact: true }).waitFor();
      await frame.locator('input[name="name"]').fill('Synthetic Visitor');
      await frame
        .locator('input[name="email"]')
        .fill('visitor@example.invalid');
      await frame
        .getByPlaceholder('Shipment number', { exact: false })
        .fill('SHIP-4242');
      await frame
        .getByPlaceholder('Postal code', { exact: false })
        .fill('12345');
      await frame.locator('form button').click();
    }
    if (profile === 'session-list') {
      await frame.locator(component('sessions/root')).waitFor();
      if (warm)
        await frame.getByText('UPGRADE REPLY 1', { exact: false }).click();
      else
        await frame.locator(component('sessions/new_conversation_btn')).click();
    }
    await frame.locator(component('chat/header')).waitFor();
  }
  async function send(text) {
    const input = frame.locator(component('chat/input_box/textarea'));
    await input.pressSequentially(text, { delay: 1 });
    assert.equal(await input.inputValue(), text);
    await input.press('Enter');
  }
  async function closeAndReopen() {
    if (profile === 'inline' || profile === 'minimal') return;
    await frame
      .locator(component('chat/header'))
      .locator('button:has(svg.lucide-x)')
      .click();
    await page.waitForFunction(() => {
      const el = document.querySelector('iframe[title="OpenCX Live Chat"]');
      if (!el) return true;
      let node = el;
      while (node) {
        const s = getComputedStyle(node);
        if (
          s.display === 'none' ||
          s.visibility === 'hidden' ||
          Number(s.opacity) < 0.01
        )
          return true;
        node = node.parentElement;
      }
      return false;
    });
    await open();
    await assertReply(frame, 1);
    assert.ok(
      await page.evaluate(() =>
        window.upgradeEvents.some((e) => e.kind === 'close'),
      ),
      'custom close callback fires',
    );
  }
  async function customization() {
    if (profile === 'minimal') return;
    const title =
      profile === 'custom-components' ? 'REACT TITLE chat' : 'CUSTOM CHAT';
    await frame.getByText(title, { exact: true }).waitFor();
    await frame
      .getByText(
        profile === 'custom-components'
          ? 'ADVANCED PERSISTENT'
          : 'LEGACY INITIAL',
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await frame.locator(component('chat/suggested_reply_btn')).count(),
      profile === 'long-content' ? 8 : 2,
    );
    if (!mobile && profile !== 'inline') {
      const initial = await page
        .locator('iframe[title="OpenCX Live Chat"]')
        .boundingBox();
      await frame
        .locator(component('chat/header'))
        .locator('button:has(svg.lucide-maximize)')
        .click();
      await frame
        .locator(component('chat/header'))
        .locator('button:has(svg.lucide-minimize)')
        .waitFor();
      await page.waitForFunction(
        (height) =>
          document
            .querySelector('iframe[title="OpenCX Live Chat"]')
            .getBoundingClientRect().height >
          height + 20,
        initial.height,
      );
      await frame
        .locator(component('chat/header'))
        .locator('button:has(svg.lucide-minimize)')
        .click();
      assert.ok(
        await page.evaluate(() =>
          window.upgradeEvents.some((e) => e.kind === 'expand'),
        ),
        'custom expand callback fires',
      );
    }
    if (['brand-form', 'verified', 'inline'].includes(profile)) {
      const chooser = page.waitForEvent('filechooser');
      const uploaded = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/backend/widget/v2/upload' &&
          r.status() === 200,
      );
      await frame.locator('button:has(svg.lucide-paperclip)').click();
      await (
        await chooser
      ).setFiles({
        name: 'upgrade.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n% synthetic upload fixture\n%%EOF'),
      });
      await uploaded;
      await frame
        .locator(component('chat/input_box/attachments_container'))
        .waitFor();
      await frame
        .locator(component('chat/input_box/attachments_container'))
        .locator('svg.animate-spin')
        .waitFor({ state: 'hidden' });
    }
  }
  async function snapshot(label) {
    if (profile === 'mode-canvas' && backend.session) {
      const mode = frame.getByText('CUSTOM MODE Fixture Mode', { exact: true });
      await mode.waitFor({ state: 'attached' });
      // The published v4 canvas is desktop-only (useCanvas explicitly gates
      // !isSmallScreen). Preserve that contract on both sides of the upgrade.
      await mode.waitFor({ state: mobile ? 'hidden' : 'visible' });
      assert.equal(await mode.isVisible(), !mobile, 'legacy canvas visibility');
      if (!mobile)
        await page.waitForFunction(() => {
          const box = document
            .querySelector('iframe[title="OpenCX Live Chat"]')
            .getBoundingClientRect();
          return (
            Math.abs(box.width - 850) < 1 && Math.abs(box.height - 650) < 1
          );
        });
    }
    await page.waitForFunction(() => {
      const el = document.querySelector('iframe[title="OpenCX Live Chat"]');
      if (!el) return false;
      let node = el;
      while (node) {
        if (Number(getComputedStyle(node).opacity) < 0.99) return false;
        node = node.parentElement;
      }
      return true;
    });
    const result = await frame.locator('body').evaluate((body) => {
      const css = (selector, properties) => {
        const element = body.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        return Object.fromEntries(properties.map((key) => [key, style[key]]));
      };
      const input = body.querySelector(
        '[data-component="chat/input_box/textarea"]',
      );
      return {
        header: css('[data-component="chat/header"]', [
          'backgroundColor',
          'color',
          'fontFamily',
        ]),
        direction: css('[data-component="chat/root"]', ['direction']),
        composer: css('[data-component="chat/input_box/textarea"]', [
          'color',
          'fontSize',
          'letterSpacing',
          'fontFamily',
        ]),
        question: css('[data-component="chat/suggested_reply_btn"]', [
          'backgroundColor',
          'color',
          'borderRadius',
        ]),
        user: css('[data-component="chat/user_msg/msg"]', [
          'backgroundColor',
          'color',
        ]),
        footer: css('span[style*="color"]', [
          'color',
          'fontWeight',
          'fontSize',
        ]),
        placeholder: input?.getAttribute('placeholder') ?? null,
        questions: [
          ...body.querySelectorAll(
            '[data-component="chat/suggested_reply_btn"]',
          ),
        ].map((q) => q.textContent),
        customTitle:
          body.querySelector('[data-upgrade="title"]')?.textContent ?? null,
        customBottom:
          body.querySelector('[data-upgrade="chat-bottom"]')?.textContent ??
          null,
        headerBottom:
          body.querySelector('[data-upgrade="header-bottom"]')?.textContent ??
          null,
        footerLink:
          body
            .querySelector('a[href="https://upgrade.test/policy"]')
            ?.getAttribute('target') ?? null,
      };
    });
    if (profile !== 'minimal') {
      assert.equal(
        result.header.backgroundColor,
        'rgb(12, 34, 56)',
        'header CSS applied',
      );
      if (result.composer) {
        assert.equal(result.composer.fontSize, '17px');
        assert.equal(result.placeholder, 'CUSTOM INPUT');
      }
      assert.equal(
        result.footer.color,
        'rgb(185, 28, 28)',
        'authored footer formatting retained',
      );
      assert.equal(result.customBottom, 'CUSTOM CHAT BOTTOM');
      assert.equal(result.headerBottom, 'HEADER BOTTOM Fixture Org');
    }
    await page.screenshot({
      path: `${output}/${engine}/${profile}-${mobile ? 'mobile' : 'desktop'}-${label}.png`,
    });
    await writeFile(
      `${output}/${engine}/${profile}-${mobile ? 'mobile' : 'desktop'}-${label}.json`,
      JSON.stringify(result, null, 2),
    );
    return result;
  }
  await createPage();
  t.after(async () => {
    try {
      await writeFile(
        `${output}/${engine}/${profile}-${mobile ? 'mobile' : 'desktop'}-${initialVersion}-requests.json`,
        JSON.stringify(backend.requests, null, 2),
      );
      assert.deepEqual(
        backend.unexpected,
        [],
        'closed fixture: no live/unexpected traffic',
      );
      assert.deepEqual(errors, [], 'no JavaScript/React errors');
    } finally {
      // Assert while the page is alive. Closing a WebKit context aborts
      // intercepted polling requests and can emit teardown-only errors.
      await context.close();
    }
  });
  return {
    context,
    get page() {
      return page;
    },
    get frame() {
      return frame;
    },
    backend,
    open,
    enterChat,
    send,
    snapshot,
    customization,
    closeAndReopen,
    async upgrade() {
      assert.deepEqual(
        errors,
        [],
        'v4 document has no runtime errors before upgrade',
      );
      // Keep the browser context (visitor storage/cookies) and backend. Open
      // the v5 document after ending v4 so WebKit's cancelled OLD-document
      // requests cannot be misattributed to v5. New-document errors are
      // captured before any v5 script executes.
      page.removeAllListeners('pageerror');
      page.removeAllListeners('console');
      await page.close();
      version = 'v5';
      await createPage();
    },
  };
}

function sendBody(backend, phase) {
  return backend.requests.find(
    (r) => r.phase === phase && r.path === '/backend/widget/v2/chat/send',
  )?.body;
}
function payloadContract(body) {
  assert.ok(body, 'message reached backend');
  const keys = [
    'bot_token',
    'headers',
    'query_params',
    'body_properties',
    'session_id',
    'content',
    'language',
    'clientContext',
    'custom_data',
    'attachments',
  ];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      key === 'attachments'
        ? body.attachments?.map(({ id, ...attachment }) => {
            assert.match(
              id,
              /^[\da-f-]{36}$/i,
              'attachment retains its generated id',
            );
            return attachment;
          })
        : body[key],
    ]),
  );
}
async function assertReply(frame, n) {
  await frame.getByText(`UPGRADE REPLY ${n}`, { exact: true }).waitFor();
}
for (const profile of profiles) {
  for (const mobile of [false, true]) {
    test(
      `${profile}: ${mobile ? 'mobile' : 'desktop'} — v4 → v5, unchanged config`,
      { timeout: 65000 },
      async (t) => {
        const f = await fixture(t, profile, mobile);
        await f.enterChat();
        await f.customization();
        const before = await f.snapshot('v4-empty');
        if (profile === 'rtl-required-above') {
          assert.equal(
            await f.frame.locator('textarea').count(),
            0,
            'required question blocks typing',
          );
          await f.frame
            .locator(component('chat/suggested_reply_btn'))
            .first()
            .click();
        } else await f.send('FIRST MESSAGE');
        await assertReply(f.frame, 1);
        const afterSend = await f.snapshot('v4-conversation');
        await f.closeAndReopen();
        const stored = await f.page.evaluate(() =>
          Object.fromEntries(
            Object.entries(localStorage).filter(([k]) =>
              /contact-token|external-contact-id/.test(k),
            ),
          ),
        );
        assert.equal(
          f.backend.requests.filter((r) => r.path.endsWith('/create-session'))
            .length,
          1,
        );
        const firstPayload = payloadContract(sendBody(f.backend, 'v4'));
        if (['brand-form', 'verified', 'inline'].includes(profile)) {
          assert.equal(
            firstPayload.attachments.length,
            1,
            'v4 file reaches send',
          );
          assert.equal(firstPayload.attachments[0].name, 'upgrade.pdf');
        }
        await f.upgrade();
        await f.enterChat(true);
        await assertReply(f.frame, 1);
        assert.deepEqual(
          await f.page.evaluate(() =>
            Object.fromEntries(
              Object.entries(localStorage).filter(([k]) =>
                /contact-token|external-contact-id/.test(k),
              ),
            ),
          ),
          stored,
          'visitor survives upgrade',
        );
        const upgraded = await f.snapshot('v5-conversation');
        if (profile !== 'minimal')
          assert.deepEqual(
            upgraded,
            afterSend,
            'configured UI and transcript styling survive upgrade',
          );
        await f.send('SECOND MESSAGE');
        await assertReply(f.frame, 2);
        assert.equal(
          f.backend.requests.filter((r) => r.path.endsWith('/create-session'))
            .length,
          1,
          'upgrade must retain conversation',
        );
        f.backend.addHumanReply();
        await f.frame
          .getByText('POLLED HUMAN REPLY', { exact: true })
          .waitFor();
        const secondBody = sendBody(f.backend, 'v5');
        assert.equal(secondBody.features.page_context, false);
        assert.equal(secondBody.features.client_tools, false);
        assert.equal(secondBody.capabilities.connections, false);
        assert.ok(
          !JSON.stringify(secondBody).includes('HOST SECRET'),
          'host content never sent',
        );
        assert.ok(
          !f.backend.requests.some(
            (r) =>
              r.path.includes('/stream') ||
              r.path.includes('/client-tools') ||
              r.path.includes('/connections'),
          ),
          'classic config stays classic',
        );
        const secondContract = payloadContract(secondBody);
        assert.deepEqual(
          {
            ...secondContract,
            content: firstPayload.content,
            attachments: firstPayload.attachments,
          },
          firstPayload,
          'custom context/headers/data remain identical',
        );
        if (profile !== 'minimal') {
          assert.ok(
            (await f.frame.locator('[data-upgrade="after"]').count()) > 0,
            'custom message component rendered',
          );
          const dates = JSON.parse(
            await f.frame
              .locator('[data-upgrade="chat-bottom"]')
              .getAttribute('data-legacy-dates'),
          );
          assert.ok(
            dates.length > 0 &&
              dates.every((date) => date && Number.isFinite(Date.parse(date))),
            'legacy deliveredAt passed to custom components',
          );
          await f.closeAndReopen();
          await f.frame
            .locator(component('chat/header'))
            .locator('button:has(svg.lucide-check)')
            .click();
          await f.frame.getByText('CUSTOM CONFIRM', { exact: true }).waitFor();
          await f.frame
            .getByRole('button', { name: 'YES RESOLVE', exact: true })
            .click();
          await f.frame.getByText('RESOLVED FOOTER', { exact: true }).waitFor();
          assert.equal(f.backend.session.isOpened, false);
          if (profile === 'custom-components')
            await f.frame
              .getByText('CUSTOM RESOLVED upgrade-session', { exact: true })
              .waitFor();
          assert.ok(
            await f.page.evaluate(() =>
              window.upgradeEvents.some(
                (e) => e.kind === 'confirmed' && e.value === 'upgrade-session',
              ),
            ),
            'confirmation callback fires',
          );
        }
        const authenticated = f.backend.requests.filter((r) =>
          [
            '/backend/widget/v2/chat/send',
            '/backend/widget/v2/create-session',
            '/backend/widget/v2/session/history/upgrade-session',
            '/backend/widget/v2/poll/upgrade-session',
            '/backend/widget/v2/upload',
          ].includes(r.path),
        );
        assert.ok(
          authenticated.every((r) =>
            r.headers.authorization?.startsWith('Bearer '),
          ),
          'all protected requests authenticated before and after upgrade',
        );
        const v4Auth = authenticated.find((r) => r.phase === 'v4').headers
          .authorization;
        assert.ok(
          authenticated.every((r) => r.headers.authorization === v4Auth),
          'same visitor auth on v4 and v5',
        );
        const fresh = await fixture(t, profile, mobile, 'v5');
        await fresh.enterChat();
        await fresh.customization();
        const freshSnapshot = await fresh.snapshot('v5-empty');
        if (profile !== 'minimal')
          assert.deepEqual(
            freshSnapshot,
            before,
            'same initial configuration on clean v5',
          );
        if (profile === 'rtl-required-above') {
          assert.equal(await fresh.frame.locator('textarea').count(), 0);
          await fresh.frame
            .locator(component('chat/suggested_reply_btn'))
            .first()
            .click();
        } else await fresh.send('FIRST MESSAGE');
        await assertReply(fresh.frame, 1);
        assert.deepEqual(
          payloadContract(sendBody(fresh.backend, 'v5')),
          firstPayload,
          'same cold-start API contract',
        );
      },
    );
  }
}

test(
  'verified identity: v4 upgrade, same-owner renewal, then another contact',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t, 'verified', false);
    await f.enterChat();
    await f.send('FIRST MESSAGE');
    await assertReply(f.frame, 1);
    await f.upgrade();
    await f.enterChat(true);
    await assertReply(f.frame, 1);
    const renewal = await f.page.evaluate(() => {
      const token = window.upgradeJwt('contact-a', 2);
      window.upgradeConfig = {
        ...window.upgradeConfig,
        user: { ...window.upgradeConfig.user, token },
      };
      window.initOpenScript(window.upgradeConfig);
      return token;
    });
    await f.send('AFTER RENEWAL');
    await assertReply(f.frame, 2);
    const renewedRequest = f.backend.requests
      .filter((r) => r.path.endsWith('/chat/send'))
      .at(-1);
    assert.equal(renewedRequest.headers.authorization, `Bearer ${renewal}`);
    assert.equal(
      f.backend.requests.filter((r) => r.path.endsWith('/create-session'))
        .length,
      1,
      'renewal keeps conversation',
    );
    assert.equal(
      f.backend.requests.filter((r) => r.path.endsWith('/config')).length,
      2,
      'renewal keeps runtime',
    );
    f.backend.switchAccount();
    const otherToken = await f.page.evaluate(() => {
      const token = window.upgradeJwt('contact-b', 3);
      window.upgradeConfig = {
        ...window.upgradeConfig,
        user: { token, externalId: 'account-b' },
      };
      window.initOpenScript(window.upgradeConfig);
      return token;
    });
    await f.page.waitForFunction(
      () =>
        !!document.querySelector('iframe[title="OpenCX Live Chat Trigger"]'),
    );
    // Identity replacement recreates the launcher in its closed state.
    await f.enterChat();
    await f.frame.getByText('LEGACY INITIAL', { exact: true }).waitFor();
    assert.equal(
      await f.frame.getByText('AFTER RENEWAL', { exact: true }).count(),
      0,
      'old contact transcript cleared',
    );
    await f.send('NEW CONTACT MESSAGE');
    await assertReply(f.frame, 1);
    const last = f.backend.requests
      .filter((r) => r.path.endsWith('/chat/send'))
      .at(-1);
    assert.equal(last.headers.authorization, `Bearer ${otherToken}`);
    assert.equal(
      f.backend.requests.filter((r) => r.path.endsWith('/create-session'))
        .length,
      2,
      'different contact gets a new conversation',
    );
  },
);
