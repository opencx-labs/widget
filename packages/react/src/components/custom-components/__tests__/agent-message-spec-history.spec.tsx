import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * History-path parity: persisted AI rows keep the raw ` ```spec ` fence (the
 * v5 stream only transforms fences on the SSE), so the default agent-message
 * component must re-derive and render the spec from the stored text — and
 * NEVER show the raw JSONL to the customer. Human (AGENT) messages must skip
 * the parse entirely.
 */

// The component pulls widget context through the headless hooks (RichText's
// anchor target, MessageAfterComponent's custom components). None of that is
// under test — pin them to inert values.
vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({}),
  useWidget: () => ({ widgetCtx: { org: null }, componentStore: { getComponent: () => null } }),
  useSessions: () => ({ sessionState: { session: null } }),
  useMessages: () => ({ messagesState: { messages: [] } }),
  useWidgetRouter: () => ({ routerState: { screen: 'chat' } }),
}));

import { AgentMessageDefaultComponent } from '../AgentMessageDefaultComponent';

let roots: Root[] = [];

function render(node: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(node));
  return container;
}

afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

const FENCED_MESSAGE = [
  'Here is your order summary:',
  '',
  '```spec',
  '{"op":"add","path":"/root","value":"main"}',
  '{"op":"add","path":"/elements/main","value":{"type":"Card","props":{"title":"Order #1024"},"children":["m"]}}',
  '{"op":"add","path":"/elements/m","value":{"type":"Metric","props":{"label":"Total","value":"$42"}}}',
  '```',
  '',
  'Anything else?',
].join('\n');

function messageProps(type: 'AI' | 'AGENT', message: string) {
  return {
    id: 'row-1',
    type,
    component: 'bot_message',
    timestamp: new Date().toISOString(),
    data: { message },
    agent: undefined,
    isFirstInGroup: true,
    isLastInGroup: true,
    isAloneInGroup: true,
  };
}

describe('AgentMessageDefaultComponent — persisted spec fences', () => {
  it('renders a stored AI fence as UI (prose + spec), never as raw JSONL', () => {
    // @ts-expect-error partial WidgetComponentProps fixture — only the fields
    // the component reads; building the full union type here adds nothing.
    const html = render(<AgentMessageDefaultComponent {...messageProps('AI', FENCED_MESSAGE)} />);

    // Prose around the fence still renders.
    expect(html.textContent).toContain('Here is your order summary');
    expect(html.textContent).toContain('Anything else?');

    // The spec compiled and rendered as components.
    expect(html.textContent).toContain('Order #1024');
    expect(html.textContent).toContain('$42');

    // The raw JSONL never reaches the customer.
    expect(html.textContent).not.toContain('"op"');
    expect(html.textContent).not.toContain('```spec');
  });

  it('renders a plain AI message exactly as before (fast path, one bubble)', () => {
    // @ts-expect-error partial WidgetComponentProps fixture (see above)
    const html = render(<AgentMessageDefaultComponent {...messageProps('AI', 'Just a normal answer.')} />);
    expect(html.textContent).toBe('Just a normal answer.');
  });

  it('does NOT parse fences in human (AGENT) messages — their text renders verbatim', () => {
    // @ts-expect-error partial WidgetComponentProps fixture (see above)
    const html = render(<AgentMessageDefaultComponent {...messageProps('AGENT', FENCED_MESSAGE)} />);
    // A human pasting patch-like text keeps it as text (code block), no spec render.
    expect(html.textContent).toContain('"op"');
  });
});
