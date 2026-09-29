// Production embed + real SSE transport + host DOM. The backend is a closed,
// local fixture: no customer accounts, AI provider calls or external requests.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium, firefox, webkit } from 'playwright';

let browser, bundle;
before(async () => {
  bundle = await readFile(
    new URL('../dist-embed/script.js', import.meta.url),
    'utf8',
  );
  browser = await { chromium, firefox, webkit }[
    process.env.WIDGET_TEST_BROWSER ?? 'chromium'
  ].launch();
});
after(async () => browser?.close());

const patches = [
  { op: 'add', path: '/root', value: 'card' },
  {
    op: 'add',
    path: '/elements/card',
    value: {
      type: 'Card',
      props: { title: 'Synthetic order' },
      children: ['table', 'links'],
    },
  },
  {
    op: 'add',
    path: '/elements/table',
    value: {
      type: 'Table',
      props: { columns: ['Item', 'Status'], rows: [['Order 42', 'Shipped']] },
    },
  },
  {
    op: 'add',
    path: '/elements/links',
    value: {
      type: 'List',
      props: {
        items: [
          { label: 'Unsafe link', href: 'javascript:alert(1)' },
          { label: '<img src=x onerror=alert(1)>' },
        ],
      },
    },
  },
];

async function fixture(t, displayMode, features, scenario, actionCase) {
  const requests = [],
    unexpected = [],
    errors = [];
  let session, stream, turnBody;
  const history = [];
  const row = (id, text, kind) => ({
    publicId: id,
    type: 'message',
    content: { text },
    sender: { kind, name: null },
    sentAt: new Date().toISOString(),
    systemMessagePayload: null,
  });
  const event = (value) => stream?.write(`data: ${JSON.stringify(value)}\n\n`);
  function finish() {
    if (!stream || stream.writableEnded) return;
    const replyId = `reply-${history.length + 1}`;
    const text =
      scenario === 'rich'
        ? 'Answer before card\n```spec\n' +
          patches.map((patch) => JSON.stringify(patch)).join('\n') +
          '\n```\nAnswer after card'
        : 'Page request finished';
    history.push(
      row(turnBody.uuid, turnBody.content, 'user'),
      row(replyId, text, 'ai'),
    );
    event({ type: 'text-start', id: 'tail' });
    event({
      type: 'text-delta',
      id: 'tail',
      delta: scenario === 'rich' ? 'Answer after card' : text,
    });
    event({ type: 'text-end', id: 'tail' });
    if (scenario === 'clarification') {
      event({
        type: 'data-turn-settled',
        data: { turn_id: `turn-${replyId}`, message_uuids: [replyId] },
      });
    }
    event({ type: 'finish-step' });
    event({ type: 'finish' });
    stream.end('data: [DONE]\n\n');
  }
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://fixture.test').pathname;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : undefined;
    const json = (value) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(value));
    };
    if (path === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:24px;font:16px sans-serif}button,input{margin:8px;padding:12px}</style></head><body>
        <h1>Local page feature fixture</h1>
        <button id="target" onclick="this.dataset.clicks=String(Number(this.dataset.clicks||0)+1);document.querySelector('#result').textContent='Host action completed'">Delete draft</button><p id="result"></p>
        ${actionCase?.html ?? ''}
        <label>Public search<input value="FIELD_VALUE_MUST_STAY_PRIVATE"></label>
        <div data-opencx-private><button>PRIVATE_CONTROL_MUST_NOT_LEAK</button></div>
        <input type="password" value="PASSWORD_MUST_NOT_LEAK">
        <script>
          const actionTarget = document.querySelector('#action-target');
          if (actionTarget) actionTarget.addEventListener(${JSON.stringify(actionCase?.event ?? 'click')}, () => { actionTarget.dataset.effects = String(Number(actionTarget.dataset.effects || 0) + 1); });
        </script><script src="/script.js"></script><script>initOpenScript(${JSON.stringify({ token: 'synthetic-bot', apiUrl: origin, displayMode, language: 'en', collectUserData: false, streaming: true, features, router: { chatScreenOnly: true } })});</script>
        </body></html>`);
      return;
    }
    if (path === '/script.js') {
      res.setHeader('content-type', 'application/javascript');
      res.end(bundle);
      return;
    }
    if (path === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    requests.push({ path, body });
    if (path === '/backend/widget/v2/config')
      return json({
        org: { id: 'local-org', name: 'Local feature fixture' },
        modes: [],
        sessionsPollingIntervalSeconds: 3600,
        sessionPollingIntervalSeconds: 3600,
        agent: {
          name: 'Fixture agent',
          avatar_url: null,
          streaming: true,
          features: {
            attachments: false,
            dictation: false,
            page_context: true,
            client_tools: true,
            page_actions: true,
            inline_ui: true,
            preamble: false,
          },
        },
      });
    if (path === '/backend/widget/v2/contact/create-unverified')
      return json({ token: 'synthetic-contact' });
    if (req.headers.authorization !== 'Bearer synthetic-contact') {
      res.writeHead(401);
      res.end();
      return;
    }
    if (path === '/backend/widget/v2/sessions')
      return json({ items: session ? [session] : [], next: null });
    if (path === '/backend/widget/v2/create-session') {
      session = {
        id: 'page-session',
        ticketNumber: 1,
        title: null,
        assignee: { kind: 'ai', name: null, avatarUrl: null },
        channel: 'web',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isHandedOff: false,
        isOpened: true,
        isVerified: false,
        lastMessage: '',
        latestStateCheckpointPayload: null,
        modeId: null,
        sessionAttributes: {},
        customStatus: null,
      };
      return json(session);
    }
    if (path === '/backend/widget/v2/poll/page-session')
      return json({ session, history });
    if (path === '/backend/widget/v2/session/history/page-session')
      return json(history);
    if (path === '/backend/widget/v5/chat/page-session/messages')
      return json({ turns: [] });
    if (path === '/backend/widget/v5/chat/page-session/stream') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (path === '/backend/widget/v5/chat/page-session/stop') {
      finish();
      return json({});
    }
    if (path === '/backend/widget/v5/chat/page-session/page-reply') {
      event({
        type: 'tool-output-available',
        toolCallId: 'page-call',
        output: body,
      });
      finish();
      return json({});
    }
    if (path === '/backend/widget/v5/chat/stream') {
      turnBody = body;
      stream = res;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
        'Cache-Control': 'no-cache',
      });
      const turnNumber = requests.filter((r) =>
        r.path.endsWith('/chat/stream'),
      ).length;
      event({ type: 'start', messageId: `assistant-${turnNumber}` });
      event({ type: 'start-step' });
      if (scenario === 'clarification' && turnNumber === 1) {
        const questions = {
          request_id: 'navigation-choice',
          questions: [
            {
              id: 'destination',
              prompt: 'Which page should I open?',
              selection: 'single',
              options: [{ id: 'payments', label: 'Payments' }],
            },
          ],
        };
        event({
          type: 'tool-input-start',
          toolCallId: 'question-call',
          toolName: 'ask_questions',
        });
        event({
          type: 'tool-input-available',
          toolCallId: 'question-call',
          toolName: 'ask_questions',
          input: questions,
        });
        event({
          type: 'tool-output-available',
          toolCallId: 'question-call',
          output: questions,
        });
        finish();
      } else if (scenario === 'rich') {
        event({ type: 'text-start', id: 'intro' });
        event({ type: 'text-delta', id: 'intro', delta: 'Answer before card' });
        event({ type: 'text-end', id: 'intro' });
        for (const patch of patches)
          event({ type: 'data-spec', data: { type: 'patch', patch } });
        finish();
      } else if (scenario === 'privacy') finish();
      else {
        const target = body.clientContext?.page_controls?.find(
          (control) => control.name === (actionCase?.name ?? 'Delete draft'),
        );
        if (!target) {
          errors.push('target absent from opted-in page snapshot');
          finish();
          return;
        }
        const input =
          scenario === 'highlight'
            ? { ref: target.ref, label: 'Your draft' }
            : {
                ref: target.ref,
                action: actionCase?.action ?? 'click',
                ...(actionCase?.value === undefined
                  ? {}
                  : { value: actionCase.value }),
              };
        event({
          type: 'tool-input-available',
          toolCallId: 'page-call',
          toolName:
            scenario === 'highlight' ? 'highlight_element' : 'act_on_page',
          input,
        });
      }
      return;
    }
    unexpected.push(path);
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  t.after(async () => {
    if (process.env.WIDGET_E2E_DEBUG) {
      console.log(
        JSON.stringify({
          test: t.name,
          requests,
          errors,
          body: await page.locator('body').innerText(),
          chat: await page
            .frameLocator('iframe[title="OpenCX Live Chat"]')
            .locator('body')
            .innerText()
            .catch(() => ''),
        }),
      );
    }
    await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin)
      return route.continue();
    unexpected.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  const frame = page.frameLocator('iframe[title="OpenCX Live Chat"]');
  async function open() {
    if (displayMode === 'companion')
      await page.locator('[data-companion-launcher]').click();
    else
      await page
        .frameLocator('iframe[title="OpenCX Live Chat Trigger"]')
        .locator('button')
        .click();
  }
  await page.goto(origin);
  await open();
  t.after(() => {
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
  });
  async function send() {
    await frame.locator('textarea').pressSequentially('Help with this page');
    await frame.locator('textarea').press('Enter');
  }
  return { page, frame, requests, send, open, finish };
}

for (const mode of ['popover', 'companion']) {
  test(
    `${mode}: clarification answers read the current host page before an approved action`,
    { timeout: 30000 },
    async (t) => {
      const f = await fixture(
        t,
        mode,
        { pageContext: true, clientTools: true, pageActions: true },
        'clarification',
        { name: 'Open payments' },
      );
      await f.send();
      const questions = f.frame.locator(
        '[data-component="chat/clarification_questions/root"]',
      );
      await questions
        .getByRole('button', { name: 'Payments', exact: true })
        .click();
      // A new screen/control appeared while the visitor was answering.
      await f.page.locator('#target').evaluate((el) => {
        el.textContent = 'Open payments';
      });
      const answerSent = f.page.waitForRequest((request) =>
        request.url().endsWith('/chat/stream'),
      );
      await questions
        .locator('[data-component="chat/clarification_questions/send"]')
        .click();
      const body = (await answerSent).postDataJSON();
      assert.equal(body.content, 'Q: Which page should I open?\nA: Payments');
      assert.ok(
        body.clientContext?.page_controls?.some(
          (c) => c.name === 'Open payments',
        ),
      );
      assert.ok(
        !body.clientContext.page_controls.some(
          (c) => c.name === 'Delete draft',
        ),
      );
      for (const privateValue of [
        'PRIVATE_CONTROL_MUST_NOT_LEAK',
        'PASSWORD_MUST_NOT_LEAK',
        'FIELD_VALUE_MUST_STAY_PRIVATE',
      ])
        assert.ok(!JSON.stringify(body.clientContext).includes(privateValue));
      const consent = f.frame.locator('[data-component="chat/page_action"]');
      await consent.getByText('Open payments', { exact: true }).waitFor();
      assert.equal(
        await f.page.locator('#target').getAttribute('data-clicks'),
        null,
      );
      const replied = f.page.waitForResponse((response) =>
        response.url().endsWith('/page-reply'),
      );
      await consent.getByRole('button', { name: 'Allow', exact: true }).click();
      await replied;
      assert.equal(
        await f.page.locator('#target').getAttribute('data-clicks'),
        '1',
      );
      assert.equal(
        f.requests.find((r) => r.path.endsWith('/page-reply')).body.outcome,
        'done',
      );
    },
  );

  test(
    `${mode}: rich cards survive stream completion and history reload safely`,
    { timeout: 30000 },
    async (t) => {
      const f = await fixture(t, mode, {}, 'rich');
      await f.send();
      await f.frame.getByText('Answer after card', { exact: true }).waitFor();
      await f.frame
        .getByRole('table')
        .getByText('Shipped', { exact: true })
        .waitFor();
      assert.equal(await f.frame.locator('a[href^="javascript:"]').count(), 0);
      assert.equal(await f.frame.locator('img[src="x"]').count(), 0);
      await f.page.reload();
      await f.open();
      await f.frame
        .getByRole('table')
        .getByText('Shipped', { exact: true })
        .waitFor();
      await f.frame.getByText('Answer before card', { exact: true }).waitFor();
      assert.equal(await f.frame.locator('a[href^="javascript:"]').count(), 0);
    },
  );

  for (const pageContext of [false, true]) {
    test(
      `${mode}: page reading opt-in=${pageContext} excludes private fields`,
      { timeout: 30000 },
      async (t) => {
        const f = await fixture(t, mode, { pageContext }, 'privacy');
        await f.send();
        await f.frame
          .getByText('Page request finished', { exact: true })
          .waitFor();
        const body = f.requests.find(
          (request) => request.path === '/backend/widget/v5/chat/stream',
        ).body;
        assert.equal(body.features.page_context, pageContext);
        assert.equal(body.features.client_tools, false);
        assert.equal(body.features.page_actions, false);
        const wire = JSON.stringify(body);
        for (const secret of [
          'FIELD_VALUE_MUST_STAY_PRIVATE',
          'PRIVATE_CONTROL_MUST_NOT_LEAK',
          'PASSWORD_MUST_NOT_LEAK',
        ])
          assert.ok(!wire.includes(secret));
        if (pageContext)
          assert.ok(
            body.clientContext.page_controls.some(
              (control) => control.name === 'Delete draft',
            ),
          );
        else assert.equal(body.clientContext, undefined);
      },
    );
  }

  test(
    `${mode}: pointing works without action permission`,
    { timeout: 30000 },
    async (t) => {
      const f = await fixture(
        t,
        mode,
        { pageContext: true, clientTools: true },
        'highlight',
      );
      await f.send();
      await f.frame
        .getByText('Page request finished', { exact: true })
        .waitFor();
      const reply = f.requests.find((request) =>
        request.path.endsWith('/page-reply'),
      ).body;
      assert.equal(reply.outcome, 'done');
      assert.equal(
        await f.page.locator('#target').getAttribute('data-clicks'),
        null,
      );
      assert.equal(
        f.requests.find((request) => request.path.endsWith('/chat/stream')).body
          .features.page_actions,
        false,
      );
    },
  );

  for (const allow of [false, true]) {
    test(
      `${mode}: committing action consent=${allow}`,
      { timeout: 30000 },
      async (t) => {
        const f = await fixture(
          t,
          mode,
          { pageContext: true, clientTools: true, pageActions: true },
          'action',
        );
        await f.send();
        const consent = f.frame.locator('[data-component="chat/page_action"]');
        await consent.getByText('Delete draft', { exact: true }).waitFor();
        assert.equal(
          await f.page.locator('#target').getAttribute('data-clicks'),
          null,
        );
        await consent
          .getByRole('button', { name: allow ? 'Allow' : 'No', exact: true })
          .click();
        await f.frame
          .getByText('Page request finished', { exact: true })
          .waitFor();
        const replies = f.requests.filter((request) =>
          request.path.endsWith('/page-reply'),
        );
        assert.equal(replies.length, 1);
        assert.equal(replies[0].body.outcome, allow ? 'done' : 'declined');
        assert.equal(
          await f.page.locator('#target').getAttribute('data-clicks'),
          allow ? '1' : null,
        );
        if (mode === 'companion') {
          // Agent clicks preserve the chat; real visitor clicks still dismiss it.
          await f.page
            .getByRole('heading', { name: 'Local page feature fixture' })
            .click();
          await f.frame
            .getByText('Page request finished', { exact: true })
            .waitFor({ state: 'hidden' });
        }
      },
    );
  }
}

// These host controls can all save immediately through JavaScript. The actual
// production adapter must wait for visitor consent regardless of label/form.
const actionCases = [
  {
    name: 'ادفع الآن',
    html: '<button id="action-target">ادفع الآن</button>',
    action: 'click',
    event: 'click',
  },
  {
    name: 'Display name',
    html: '<input id="action-target" aria-label="Display name" value="Before">',
    action: 'fill',
    value: 'After',
    event: 'input',
  },
  {
    name: 'Plan',
    html: '<select id="action-target" aria-label="Plan"><option value="basic">Basic</option><option value="plan_42">Pro — $49/month</option></select>',
    action: 'select',
    value: 'plan_42',
    valueLabel: 'Pro — $49/month',
    event: 'change',
  },
  {
    name: 'Renewal',
    html: '<input id="action-target" type="checkbox" aria-label="Renewal">',
    action: 'check',
    event: 'change',
  },
  {
    name: 'Renewal',
    html: '<input id="action-target" type="checkbox" aria-label="Renewal" checked>',
    action: 'uncheck',
    event: 'change',
  },
];
for (const mode of ['popover', 'companion']) {
  for (const actionCase of actionCases) {
    for (const allow of [false, true]) {
      test(
        `${mode}: ${actionCase.action} consent=${allow} prevents premature host effects`,
        { timeout: 30000 },
        async (t) => {
          const f = await fixture(
            t,
            mode,
            { pageContext: true, clientTools: true, pageActions: true },
            'action',
            actionCase,
          );
          const target = f.page.locator('#action-target');
          const before = await target.evaluate((el) => ({
            value: el.value,
            checked: el.checked,
          }));
          await f.send();
          const consent = f.frame.locator(
            '[data-component="chat/page_action"]',
          );
          await consent.getByText(actionCase.name, { exact: true }).waitFor();
          if (actionCase.value !== undefined)
            await consent
              .getByText(actionCase.valueLabel ?? actionCase.value, {
                exact: true,
              })
              .waitFor();
          assert.equal(await target.getAttribute('data-effects'), null);
          assert.deepEqual(
            await target.evaluate((el) => ({
              value: el.value,
              checked: el.checked,
            })),
            before,
          );
          await consent
            .getByRole('button', { name: allow ? 'Allow' : 'No', exact: true })
            .click();
          await f.frame
            .getByText('Page request finished', { exact: true })
            .waitFor();
          const replies = f.requests.filter((request) =>
            request.path.endsWith('/page-reply'),
          );
          assert.equal(replies.length, 1);
          assert.equal(replies[0].body.outcome, allow ? 'done' : 'declined');
          assert.equal(
            await target.getAttribute('data-effects'),
            allow ? '1' : null,
          );
          if (!allow)
            assert.deepEqual(
              await target.evaluate((el) => ({
                value: el.value,
                checked: el.checked,
              })),
              before,
            );
          else if (actionCase.value !== undefined)
            assert.equal(await target.inputValue(), actionCase.value);
          else if (actionCase.action !== 'click')
            assert.equal(
              await target.isChecked(),
              actionCase.action === 'check',
            );
        },
      );
    }
  }
  test(
    `${mode}: an ambiguous dropdown request makes no change or consent offer`,
    { timeout: 30000 },
    async (t) => {
      const f = await fixture(
        t,
        mode,
        { pageContext: true, clientTools: true, pageActions: true },
        'action',
        {
          name: 'Plan',
          html: '<select id="action-target" aria-label="Plan"><option value="free">Free</option><option value="pro">Pro</option><option value="Pro">Basic</option></select>',
          action: 'select',
          value: 'Pro',
          event: 'change',
        },
      );
      await f.send();
      await f.frame
        .getByText('Page request finished', { exact: true })
        .waitFor();
      const replies = f.requests.filter((request) =>
        request.path.endsWith('/page-reply'),
      );
      assert.equal(replies.length, 1);
      assert.equal(replies[0].body.outcome, 'no_change');
      assert.equal(await f.page.locator('#action-target').inputValue(), 'free');
      assert.equal(
        await f.page.locator('#action-target').getAttribute('data-effects'),
        null,
      );
      assert.equal(
        await f.frame.locator('[data-component="chat/page_action"]').count(),
        0,
      );
    },
  );
  test(
    `${mode}: a dropdown option changed during approval is declined`,
    { timeout: 30000 },
    async (t) => {
      const actionCase = actionCases.find(
        (candidate) => candidate.action === 'select',
      );
      assert.ok(actionCase);
      const f = await fixture(
        t,
        mode,
        { pageContext: true, clientTools: true, pageActions: true },
        'action',
        actionCase,
      );
      await f.send();
      const consent = f.frame.locator('[data-component="chat/page_action"]');
      await consent.getByText(actionCase.valueLabel, { exact: true }).waitFor();
      const target = f.page.locator('#action-target');
      assert.equal(await target.inputValue(), 'basic');
      await target.locator('option[value="plan_42"]').evaluate((option) => {
        option.label = 'Enterprise — $499/month';
      });
      await consent.getByRole('button', { name: 'Allow', exact: true }).click();
      await f.frame
        .getByText('Page request finished', { exact: true })
        .waitFor();
      const replies = f.requests.filter((request) =>
        request.path.endsWith('/page-reply'),
      );
      assert.equal(replies.length, 1);
      assert.equal(replies[0].body.outcome, 'declined');
      assert.equal(await target.inputValue(), 'basic');
      assert.equal(await target.getAttribute('data-effects'), null);
    },
  );
}
