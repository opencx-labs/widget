import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { ConnectionCard } from '../ConnectionCard';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const fixture = vi.hoisted(() => {
  const state: {
    phase: 'idle' | 'loading' | 'ready' | 'waiting' | 'connected' | 'external';
    authorization: {
      url: string;
      host: string;
      completion: 'oauth' | 'external';
    } | null;
    error: string | null;
  } = { phase: 'idle', authorization: null, error: null };
  return { state, start: vi.fn(), opened: vi.fn(), sendMessage: vi.fn() };
});
vi.mock('@opencx/widget-react-headless', () => ({
  useConnection: () => ({
    ...fixture.state,
    start: fixture.start,
    opened: fixture.opened,
  }),
  useMessages: () => ({ sendMessage: fixture.sendMessage }),
}));
const request = {
  request_id: 'b1111111-1111-4111-8111-111111111111',
  server_id: 'a1111111-1111-4111-8111-111111111111',
  name: 'Bookkeeping',
};
let root: Root;
let container: HTMLDivElement;
function render(element: React.ReactNode) {
  act(() => root.render(element));
  return {
    rerender: (next: React.ReactNode) => act(() => root.render(next)),
    unmount: () => act(() => root.render(null)),
  };
}
function button(name: string) {
  const el = Array.from(container.querySelectorAll('button')).find(
    (el) =>
      el.getAttribute('aria-label') === name || el.textContent?.endsWith(name),
  );
  if (!el) throw new Error(`Button missing: ${name}`);
  return el;
}
const click = (el: HTMLElement) => act(() => el.click());
beforeEach(() => {
  vi.clearAllMocks();
  fixture.state.phase = 'idle';
  fixture.state.authorization = null;
  fixture.state.error = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('starts with one click and retains an isolated Connect link if popups are blocked', () => {
  const { rerender } = render(<ConnectionCard request={request} />);
  expect(fixture.start).not.toHaveBeenCalled();
  click(button('Connect'));
  expect(fixture.start).toHaveBeenCalledOnce();
  fixture.state.phase = 'ready';
  fixture.state.authorization = {
    url: 'https://accounts.example/connect',
    host: 'accounts.example',
    completion: 'oauth',
  };
  rerender(<ConnectionCard request={request} />);
  const link = container.querySelector('a');
  expect(link?.getAttribute('href')).toBe('https://accounts.example/connect');
  expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(link?.getAttribute('aria-label')).toContain('accounts.example');
  expect(link?.textContent).toBe('Connect');
  click(link ?? button('Connect'));
  expect(fixture.opened).toHaveBeenCalledOnce();
});

it('blocks repeated starts while loading, then offers a retry after failure', () => {
  fixture.state.phase = 'loading';
  const { rerender } = render(<ConnectionCard request={request} />);
  const preparing = button('Preparing…');
  expect(preparing.disabled).toBe(true);
  expect(preparing.getAttribute('aria-busy')).toBe('true');
  click(preparing);
  expect(fixture.start).not.toHaveBeenCalled();
  fixture.state.phase = 'idle';
  fixture.state.error = 'Could not start the connection.';
  rerender(<ConnectionCard request={request} />);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    fixture.state.error,
  );
  click(button('Try again'));
  expect(fixture.start).toHaveBeenCalledOnce();
});

it('keeps approval recoverable without claiming that access is connected', () => {
  fixture.state.phase = 'waiting';
  fixture.state.authorization = {
    url: 'https://accounts.example/connect',
    host: 'accounts.example',
    completion: 'oauth',
  };
  const { rerender } = render(<ConnectionCard request={request} />);
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    'Waiting for approval',
  );
  expect(container.querySelector('a')).toBeNull();
  expect(button('Waiting…').disabled).toBe(true);
  expect(container.textContent).not.toContain('is connected');
  fixture.state.phase = 'external';
  rerender(<ConnectionCard request={request} />);
  expect(fixture.sendMessage).toHaveBeenCalledWith({
    background: true,
    content:
      'I returned from setting up Bookkeeping. Please try its tools again and continue my previous request.',
  });
});

it('explains expired access and offers reconnect', () => {
  render(<ConnectionCard request={request} reconnect />);
  expect(button('Reconnect').title).toContain('Your access expired.');
  click(button('Reconnect'));
  expect(fixture.start).toHaveBeenCalledOnce();
});

it('resumes once after connecting and lets users decline', () => {
  fixture.state.phase = 'connected';
  const { unmount, rerender } = render(<ConnectionCard request={request} />);
  rerender(<ConnectionCard request={request} />);
  expect(fixture.sendMessage).toHaveBeenCalledOnce();
  expect(fixture.sendMessage).toHaveBeenCalledWith({
    background: true,
    content:
      'The connection to Bookkeeping is ready. Please use its tools to continue my previous request.',
  });
  expect(container.querySelector('button')).toBeNull();
  unmount();
  fixture.sendMessage.mockClear();
  fixture.state.phase = 'idle';
  render(<ConnectionCard request={request} />);
  click(button('Not now'));
  expect(fixture.sendMessage).toHaveBeenCalledWith({
    content: 'Continue without connecting Bookkeeping.',
  });
});

it('automatically invokes a custom continuation only once', () => {
  const onContinue = vi.fn();
  const { rerender } = render(
    <ConnectionCard request={request} onContinue={onContinue} />,
  );
  fixture.state.phase = 'connected';
  rerender(<ConnectionCard request={request} onContinue={onContinue} />);
  rerender(
    <ConnectionCard request={request} onContinue={() => onContinue()} />,
  );
  expect(onContinue).toHaveBeenCalledOnce();
  expect(fixture.sendMessage).not.toHaveBeenCalled();
});

it('uses a supplied logo and falls back to the MCP mark when it fails', () => {
  const images: HTMLImageElement[] = [];
  const imageMock = vi.spyOn(window, 'Image').mockImplementation(() => {
    const image = document.createElement('img');
    images.push(image);
    return image;
  });
  try {
    const { rerender } = render(
      <ConnectionCard
        request={request}
        logoUrl="https://example.com/logo.png"
      />,
    );
    act(() => images[0]?.dispatchEvent(new Event('load')));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/logo.png',
    );
    expect(container.querySelector('[data-mcp-icon]')).toBeNull();
    rerender(
      <ConnectionCard
        request={request}
        logoUrl="https://example.com/missing.png"
      />,
    );
    act(() => images[1]?.dispatchEvent(new Event('error')));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-mcp-icon]')).not.toBeNull();
    rerender(<ConnectionCard request={request} />);
    expect(container.querySelector('[data-mcp-icon]')).not.toBeNull();
  } finally {
    imageMock.mockRestore();
  }
});
