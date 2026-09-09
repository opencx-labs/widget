import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './src';
import { ConnectionCard } from './src/components/ConnectionCard';
import { UserMessage } from './src/components/UserMessage';
import { AgentMessage } from './src/components/AgentMessage';
import './connections.preview.css';

const params = new URLSearchParams(location.search);
const mode = params.get('case') ?? 'oto';
const state = params.get('state') ?? 'idle';
const name = mode === 'mollie' ? 'Bookkeeping' : 'OTO';
const serverId = '11111111-1111-4111-8111-111111111111';
const storageKey = `preview-connected-${mode}`;
const originalFetch = window.fetch.bind(window);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
let startAttempts = 0;
// Only transport and example responses are simulated. UI imports are production components.
window.fetch = async (input, init) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/backend/'))
    return originalFetch(input, init);
  if (url.pathname.endsWith('/config'))
    return json({
      org: {
        id: 'preview',
        name: mode === 'oto' ? 'OTO' : mode === 'mollie' ? 'Mollie' : 'Acme',
      },
      modes: [],
      sessionPollingIntervalSeconds: 30,
      sessionsPollingIntervalSeconds: 60,
      agent: {
        name: 'Assistant',
        streaming: false,
        avatar_url: null,
        features: {
          preamble: false,
          inline_ui: false,
          dictation: false,
          attachments: false,
          page_context: false,
          client_tools: false,
        },
      },
    });
  if (url.pathname.endsWith('/sessions'))
    return json({ items: [], next: null });
  if (url.pathname.endsWith('/connections')) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return json(
      mode === 'default'
        ? []
        : [
            {
              server_id: serverId,
              name,
              status: localStorage.getItem(storageKey)
                ? 'connected'
                : state === 'reconnect'
                  ? 'reconnect_required'
                  : 'not_connected',
            },
          ],
    );
  }
  if (url.pathname.endsWith('/start')) {
    startAttempts++;
    await new Promise((resolve) =>
      setTimeout(resolve, state === 'slow' ? 8000 : 800),
    );
    if (state === 'error' && startAttempts === 1)
      return json({ message: 'Unavailable' }, 503);
    return json(
      {
        authorization_url: `${location.origin}/connections.consent.html?case=${mode}`,
        completion: mode === 'mollie' ? 'external' : 'oauth',
      },
      201,
    );
  }
  if (req.method === 'DELETE') {
    localStorage.removeItem(storageKey);
    return new Response(null, { status: 204 });
  }
  return json({ items: [], next: null });
};
function DemoFlow() {
  const [done, setDone] = useState(
    mode === 'default' || !!localStorage.getItem(storageKey),
  );
  const [skipped, setSkipped] = useState(false);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const question =
    mode === 'oto'
      ? 'Show the status of my latest shipments.'
      : mode === 'mollie'
        ? 'Which invoices are missing a matching payment?'
        : 'Find the order for customer Alex.';
  const answer = skipped
    ? 'I can help with general questions. Connect your account whenever you want me to check your data.'
    : done
      ? mode === 'oto'
        ? 'Two shipments were delivered. One is on its way.'
        : mode === 'mollie'
          ? 'I found 3 invoices without a matching payment.'
          : 'Alex’s order shipped today and arrives Friday.'
      : `Connect ${name} so I can check your account.`;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex justify-end">
        <UserMessage
          message={{
            id: 'preview-question',
            type: 'USER',
            content: question,
            timestamp: null,
          }}
          isFirstInGroup
          isLastInGroup
          isAloneInGroup
        />
      </div>
      <AgentMessage
        id="preview-answer"
        type="AI"
        component="bot_message"
        data={{ message: answer }}
        timestamp={null}
        isFirstInGroup
        isLastInGroup
        isAloneInGroup
      />
      {setupAttempt > 0 && !done && !skipped && (
        <p role="alert" className="text-sm text-destructive">
          Access wasn’t approved. You can connect whenever you’re ready.
        </p>
      )}
      {!skipped && !done && (
        <ConnectionCard
          key={setupAttempt}
          request={{
            server_id: serverId,
            request_id: '22222222-2222-4222-8222-222222222222',
            name,
          }}
          reconnect={state === 'reconnect'}
          onContinue={() => {
            if (localStorage.getItem(storageKey)) {
              setDone(true);
            } else setSetupAttempt((attempt) => attempt + 1);
          }}
          onDismiss={() => {
            setSkipped(true);
          }}
        />
      )}
    </div>
  );
}
function Preview() {
  return (
    <main>
      <aside>
        <a className="brand" href="?case=oto">
          OpenCX
        </a>
        <div>
          <h1>Connection preview</h1>
          <p>Real widget. Simulated account data.</p>
        </div>
        <nav aria-label="Customer use case">
          <a href="/connections.live.html">Linear · Live</a>
          {[
            ['default', 'Shared account'],
            ['oto', 'OTO'],
            ['mollie', 'Mollie'],
          ].map(([id, label]) => (
            <a
              aria-current={mode === id ? 'page' : undefined}
              href={`?case=${id}`}
              key={id}
            >
              {label}
            </a>
          ))}
        </nav>
        {mode !== 'default' && (
          <div className="preview-controls">
            <label htmlFor="preview-state">Try a state</label>
            <select
              id="preview-state"
              name="state"
              value={state}
              onChange={(event) => {
                localStorage.removeItem(storageKey);
                location.search = `?case=${mode}&state=${event.target.value}`;
              }}
            >
              <option value="idle">Connect</option>
              <option value="slow">Slow connection</option>
              <option value="error">Error → retry</option>
              <option value="reconnect">Access expired</option>
            </select>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(storageKey);
                location.reload();
              }}
            >
              Restart flow
            </button>
          </div>
        )}
        <p className="hint">
          {mode === 'default'
            ? 'The assistant uses the team’s shared connection.'
            : mode === 'oto'
              ? 'Each user connects their own account in the widget.'
              : 'Customers approve access in your product. Your gateway keeps the credentials.'}
        </p>
      </aside>
      <section className="host" aria-label="Example customer product">
        <header>
          {mode === 'oto'
            ? 'OTO / Shipments'
            : mode === 'mollie'
              ? 'Mollie / Payments'
              : 'Acme / Orders'}
          <span>Alex · Main account</span>
        </header>
        <div className="content">
          <h2>
            {mode === 'oto'
              ? 'Shipments'
              : mode === 'mollie'
                ? 'Payments'
                : 'Orders'}
          </h2>
          <p>September overview</p>
          <div className="metrics">
            <div>
              <p>This month</p>
              <strong>{mode === 'oto' ? '128 shipments' : '€24,810'}</strong>
            </div>
            <div>
              <p>Completed</p>
              <strong>94.2%</strong>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {['1042', '1041', '1040'].map((id, i) => (
                <tr key={id}>
                  <td>#{id}</td>
                  <td>{['Studio North', 'Nomad Store', 'Paper & Co'][i]}</td>
                  <td>{i === 2 ? 'Pending' : 'Completed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Widget
        options={{
          token: 'preview-public-widget-key',
          apiUrl: location.origin,
          user: { token: 'preview-user', externalId: mode },
          isOpen: true,
          displayMode: 'companion',
          companion: { defaultLayout: 'sidebar' },
          router: { chatScreenOnly: true },
          customComponents: {
            chatBottomComponents: [
              { key: 'connection-preview', component: DemoFlow },
            ],
          },
        }}
      />
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Preview />);
