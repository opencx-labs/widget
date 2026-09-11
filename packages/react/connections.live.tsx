import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { Widget } from './src';
import './connections.preview.css';

const sessionSchema = z.object({
  widgetToken: z.string(),
  userToken: z.string(),
  externalId: z.string(),
});
function LiveConnections() {
  const [session, setSession] = useState<z.infer<typeof sessionSchema>>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const response = await fetch('/connections-live/session', {
          method: 'POST',
          headers: { 'x-opencx-demo': '1' },
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            'The local backend is unavailable. Reload to try again.',
          );
        const result = sessionSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setSession(result);
        setError(undefined);
        timer = setTimeout(load, 50 * 60_000);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not open the assistant.',
          );
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <main>
      <aside>
        <a className="brand" href="/connections.live.html">
          OpenCX
        </a>
        <div>
          <h1>Live connection</h1>
          <p>Connect your own Linear account.</p>
        </div>
        <nav aria-label="Connection examples">
          <a href="/connections.live.html" aria-current="page">
            Linear · Live
          </a>
          <a href="/connections.preview.html?case=oto">OTO · Preview</a>
          <a href="/connections.preview.html?case=mollie">Mollie · Preview</a>
          <a href="/connections.preview.html?case=default">
            Shared account · Preview
          </a>
        </nav>
        <p className="hint">
          Read-only access. Uses your Linear data to answer your questions.
        </p>
      </aside>
      <section className="host" aria-label="Linear connection example">
        <header>
          Linear<span>Live account</span>
        </header>
        <div className="content">
          <h2>Your Linear workspace</h2>
          <p>
            Ask the assistant to find your assigned issues, summarize a project,
            or look up an issue.
          </p>
          <p>
            <a
              href="https://linear.app/docs/mcp"
              target="_blank"
              rel="noopener noreferrer"
            >
              About Linear’s connection
            </a>
          </p>
          {error ? (
            <p role="alert">{error}</p>
          ) : (
            !session && <p role="status">Opening your assistant…</p>
          )}
        </div>
      </section>
      {session && (
        <Widget
          options={{
            token: session.widgetToken,
            apiUrl: location.origin,
            user: { token: session.userToken, externalId: session.externalId },
            isOpen: true,
            displayMode: 'companion',
            companion: { defaultLayout: 'sidebar' },
            router: { chatScreenOnly: true },
            initialMessages: [
              'What would you like to know about your Linear workspace?',
            ],
            initialQuestions: ['Show my assigned Linear issues'],
          }}
        />
      )}
    </main>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Root is missing');
createRoot(root).render(<LiveConnections />);
