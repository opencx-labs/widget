// Production widget download plumbing. The local HTTP fixture supplies synthetic
// chat/report bytes; backend authorization has separate real-service coverage.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium, firefox, webkit } from 'playwright';

let browser, bundle;
before(async () => {
  bundle = await readFile(new URL('../dist-embed/script.js', import.meta.url));
  browser = await { chromium, firefox, webkit }[
    process.env.WIDGET_TEST_BROWSER ?? 'chromium'
  ].launch();
});
after(async () => browser?.close());

for (const displayMode of ['popover', 'companion']) {
  for (const rich of [false, true]) {
    test(
      `${displayMode}: private ${rich ? 'rich list' : 'text'} report downloads live and from history`,
      { timeout: 30000 },
      async (t) => {
        const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const fileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        const path = `/backend/widget/v5/workspace/${sessionId}/files/${fileId}`;
        let origin,
          sent = false;
        const downloads = [],
          unexpected = [],
          errors = [];
        const session = {
          id: sessionId,
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
        const patches = () => [
          { op: 'add', path: '/root', value: 'report' },
          {
            op: 'add',
            path: '/elements/report',
            value: {
              type: 'List',
              props: {
                items: [{ label: 'Download report', href: origin + path }],
              },
            },
          },
        ];
        const text = () =>
          rich
            ? '```spec\n' +
              patches()
                .map((p) => JSON.stringify(p))
                .join('\n') +
              '\n```'
            : `[Download report](${origin}${path})`;
        const history = () =>
          sent
            ? [
                {
                  publicId: 'reply',
                  type: 'message',
                  content: { text: text() },
                  sender: { kind: 'ai', name: null },
                  sentAt: '2026-01-01T00:00:00Z',
                  systemMessagePayload: null,
                },
              ]
            : [];
        const server = createServer(async (req, res) => {
          const url = new URL(req.url, origin);
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = chunks.length
            ? JSON.parse(Buffer.concat(chunks).toString())
            : null;
          const json = (value) => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(value));
          };
          if (url.pathname === '/') {
            res.setHeader('content-type', 'text/html');
            return res.end(
              `<!doctype html><html><body><h1>Local download fixture</h1><script src="/script.js"></script><script>initOpenScript(${JSON.stringify({ token: 'synthetic-bot', apiUrl: origin, displayMode, language: 'en', collectUserData: false, streaming: displayMode === 'companion', router: { chatScreenOnly: true } })})</script></body></html>`,
            );
          }
          if (url.pathname === '/script.js') {
            res.setHeader('content-type', 'application/javascript');
            return res.end(bundle);
          }
          if (url.pathname === '/favicon.ico') {
            res.writeHead(204);
            return res.end();
          }
          if (url.pathname === '/backend/widget/v2/config')
            return json({
              org: { id: 'fixture-org', name: 'Fixture' },
              modes: [],
              sessionPollingIntervalSeconds: 3600,
              sessionsPollingIntervalSeconds: 3600,
              agent: {
                name: 'Fixture',
                avatar_url: null,
                streaming: true,
                features: {
                  inline_ui: true,
                  attachments: false,
                  dictation: false,
                  page_context: false,
                  client_tools: false,
                  preamble: false,
                },
              },
            });
          if (url.pathname === '/backend/widget/v2/contact/create-unverified')
            return json({ token: 'synthetic-contact' });
          if (req.headers.authorization !== 'Bearer synthetic-contact') {
            res.writeHead(401);
            return res.end();
          }
          if (url.pathname === '/backend/widget/v2/sessions')
            return json({ items: sent ? [session] : [], next: null });
          if (url.pathname === '/backend/widget/v2/create-session')
            return json(session);
          if (url.pathname === `/backend/widget/v2/poll/${sessionId}`)
            return json({ session, history: history() });
          if (
            url.pathname === `/backend/widget/v2/session/history/${sessionId}`
          )
            return json(history());
          if (url.pathname === `/backend/widget/v5/chat/${sessionId}/messages`)
            return json({ turns: [] });
          if (url.pathname === `/backend/widget/v5/chat/${sessionId}/stream`) {
            res.writeHead(204);
            return res.end();
          }
          if (url.pathname === path) {
            downloads.push({ headers: req.headers, url: req.url });
            res.writeHead(200, {
              'content-type': 'application/octet-stream',
              'content-disposition': "attachment; filename*=UTF-8''report.csv",
              'cache-control': 'private, no-store',
            });
            return res.end('region,total\nNorth,120\n');
          }
          if (
            url.pathname === '/backend/widget/v2/chat/send' ||
            url.pathname === '/backend/widget/v5/chat/stream'
          ) {
            assert.equal(body.capabilities.workspace_downloads, true);
            sent = true;
            if (url.pathname.endsWith('/send'))
              return json({
                success: true,
                autopilotResponse: {
                  type: 'text',
                  value: { error: false, content: text() },
                  id: 'reply',
                  mightSolveUserIssue: false,
                  completelyAndFullyCoveredUserIssue: false,
                  assistMode: false,
                },
              });
            res.writeHead(200, {
              'content-type': 'text/event-stream',
              'x-vercel-ai-ui-message-stream': 'v1',
            });
            const event = (value) =>
              res.write(`data: ${JSON.stringify(value)}\n\n`);
            event({ type: 'start', messageId: 'reply' });
            event({ type: 'start-step' });
            if (rich)
              for (const patch of patches())
                event({ type: 'data-spec', data: { type: 'patch', patch } });
            else {
              event({ type: 'text-start', id: 'text' });
              event({ type: 'text-delta', id: 'text', delta: text() });
              event({ type: 'text-end', id: 'text' });
            }
            event({ type: 'finish-step' });
            event({ type: 'finish' });
            return res.end('data: [DONE]\n\n');
          }
          unexpected.push(url.pathname);
          res.writeHead(404);
          res.end('{}');
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${server.address().port}`;
        const context = await browser.newContext({
          acceptDownloads: true,
          serviceWorkers: 'block',
        });
        t.after(async () => {
          await context.close();
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (e) => errors.push(e.message));
        await context.route('**/*', (route) => {
          if (new URL(route.request().url()).origin !== origin) {
            unexpected.push(route.request().url());
            return route.abort();
          }
          return route.continue();
        });
        const frame = page.frameLocator('iframe[title="OpenCX Live Chat"]');
        const open = async () =>
          displayMode === 'companion'
            ? page.locator('[data-companion-launcher]').click()
            : page
                .frameLocator('iframe[title="OpenCX Live Chat Trigger"]')
                .locator('button')
                .click();
        await page.goto(origin);
        await open();
        await frame.locator('textarea').fill('Prepare my report');
        await frame.locator('textarea').press('Enter');
        for (const phase of ['live', 'history']) {
          if (phase === 'history') {
            await page.reload();
            await open();
          }
          const [download] = await Promise.all([
            page.waitForEvent('download'),
            frame
              .getByRole('link', { name: 'Download report', exact: true })
              .click(),
          ]).catch(async (error) => {
            console.error({
              displayMode,
              rich,
              phase,
              downloads,
              unexpected,
              errors,
              pageUrl: page.url(),
              pages: context.pages().map((p) => p.url()),
              frames: page
                .frames()
                .map((f) => ({ name: f.name(), url: f.url() })),
              text: await page.locator('body').innerText(),
            });
            throw error;
          });
          assert.equal(download.suggestedFilename(), 'report.csv');
          assert.equal(
            await readFile(await download.path(), 'utf8'),
            'region,total\nNorth,120\n',
          );
          assert.equal(page.url(), origin + '/');
        }
        assert.equal(downloads.length, 2);
        assert.ok(
          downloads.every(
            (d) =>
              d.headers.authorization === 'Bearer synthetic-contact' &&
              d.headers['x-bot-token'] === 'synthetic-bot' &&
              d.url === path,
          ),
        );
        assert.deepEqual(unexpected, []);
        assert.deepEqual(errors, []);
      },
    );
  }
}
