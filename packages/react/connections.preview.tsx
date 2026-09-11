import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './src';
import {
  clearPreviewState,
  createPreviewBackend,
  parsePreviewMode,
  parsePreviewState,
  preview,
} from './connections.preview-api';
import './connections.preview.css';

const params = new URLSearchParams(location.search);
const mode = parsePreviewMode(params.get('case'));
const state = parsePreviewState(params.get('state'));
const originalFetch = window.fetch.bind(window);
window.fetch = createPreviewBackend({
  fallback: originalFetch,
  mode,
  origin: location.origin,
  state,
  storage: localStorage,
});

function Preview() {
  return (
    <main>
      <aside>
        <a className="brand" href="?case=oto">
          OpenCX
        </a>
        <div>
          <h1>Connection preview</h1>
          <p>Production widget flow. Simulated account data.</p>
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
                clearPreviewState(localStorage, mode);
                location.search = `?case=${mode}&state=${event.target.value}`;
              }}
            >
              <option value="idle">Connect</option>
              <option value="slow">Slow connection</option>
              <option value="error">Error → retry</option>
              <option value="reconnect">Expired request</option>
            </select>
            <button
              type="button"
              onClick={() => {
                clearPreviewState(localStorage, mode);
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
          capabilities: { connections: true },
          initialMessages: ['What would you like me to check?'],
          initialQuestions: [preview.questions[mode]],
        }}
      />
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Preview />);
