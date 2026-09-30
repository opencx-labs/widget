import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ElicitationForm } from '../ElicitationForm';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const fixture = vi.hoisted(() => ({
  listElicitations: vi.fn().mockResolvedValue([]),
  config: {} as {
    user?: { token?: string };
    capabilities?: { connections?: boolean };
  },
}));
vi.mock('@opencx/widget-react-headless', () => ({
  useWidget: () => ({
    widgetCtx: { api: { listElicitations: fixture.listElicitations } },
    config: fixture.config,
  }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  fixture.config = {};
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = () =>
  act(() => root.render(<ElicitationForm sessionId="s1" active={true} />));

it('does not poll for approval requests while the visitor is anonymous', async () => {
  fixture.config = { user: { token: undefined } };
  await mount();
  expect(fixture.listElicitations).not.toHaveBeenCalled();
});

it('polls once the user is signed in', async () => {
  fixture.config = { user: { token: 'signed-user-token' } };
  await mount();
  expect(fixture.listElicitations).toHaveBeenCalledWith(
    's1',
    expect.any(AbortSignal),
  );
});

it('still respects an explicit connections opt-out when signed in', async () => {
  fixture.config = {
    user: { token: 'signed-user-token' },
    capabilities: { connections: false },
  };
  await mount();
  expect(fixture.listElicitations).not.toHaveBeenCalled();
});
