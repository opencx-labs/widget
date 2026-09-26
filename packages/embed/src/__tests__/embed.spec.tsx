import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: fixture.createRoot }));
vi.mock('@opencx/widget-react', () => ({ Widget: () => null }));

beforeEach(() => {
  delete window.__opencxEmbedRuntime;
  vi.resetModules();
  vi.clearAllMocks();
  document.body.replaceChildren();
  fixture.createRoot.mockReturnValue({ render: fixture.render });
});

it('installs the v4 synchronous API and reuses its root on token renewal', async () => {
  await import('../index');
  expect(typeof window.initOpenScript).toBe('function');
  window.initOpenScript({ token: 'bot', user: { token: 'first' } });
  window.initOpenScript({ token: 'bot', user: { token: 'renewed' } });
  expect(fixture.createRoot).toHaveBeenCalledOnce();
  expect(document.querySelectorAll('#opencx-root')).toHaveLength(1);
  expect(fixture.render.mock.calls.at(-1)?.[0].props.options.user.token).toBe(
    'renewed',
  );
  expect(document.querySelector('script[type="module"]')).toBeNull();
});

it('reuses the original initializer and React root after script re-evaluation', async () => {
  await import('../index');
  const originalInit = window.initOpenScript;
  originalInit({ token: 'bot', user: { token: 'first' } });
  const originalComponent = fixture.render.mock.calls[0]?.[0].type;

  // A second IIFE has fresh module state, as with SPA script reinjection.
  vi.resetModules();
  await import('../index');
  expect(window.initOpenScript).toBe(originalInit);
  window.initOpenScript({ token: 'bot', user: { token: 'renewed' } });
  expect(fixture.createRoot).toHaveBeenCalledOnce();
  expect(document.querySelectorAll('#opencx-root')).toHaveLength(1);
  expect(fixture.render.mock.calls.at(-1)?.[0].type).toBe(originalComponent);
  expect(fixture.render.mock.calls.at(-1)?.[0].props.options.user.token).toBe(
    'renewed',
  );
});

it('reuses the initializer when scripts are repeated before initialization', async () => {
  await import('../index');
  const originalInit = window.initOpenScript;
  vi.resetModules();
  await import('../index');
  expect(window.initOpenScript).toBe(originalInit);
  expect(fixture.createRoot).not.toHaveBeenCalled();
  window.initOpenScript({ token: 'bot' });
  expect(fixture.createRoot).toHaveBeenCalledOnce();
});
