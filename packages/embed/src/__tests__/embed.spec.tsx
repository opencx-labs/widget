import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: fixture.createRoot }));
vi.mock('@opencx/widget-react', () => ({ Widget: () => null }));

beforeEach(() => {
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
