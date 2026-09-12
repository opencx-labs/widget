import type { WidgetAiMessage, WidgetConfig } from '@opencx/widget-core';
import type { StreamingTurnState } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const config = vi.hoisted((): WidgetConfig => ({ token: 'test' }));
vi.mock('@opencx/widget-react-headless', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opencx/widget-react-headless')>()),
  useConfig: () => config,
  useDisplayMode: () => 'companion',
  useWidget: () => ({
    widgetCtx: { agent: {} },
    config,
    componentStore: { getComponent: () => () => <div>Tool activity</div> },
  }),
}));
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
vi.mock('../lib/tooltip', () => ({
  Tooltippy: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../AgentAvatar', () => ({ AgentAvatar: () => null }));
vi.mock('../AgentMessage', () => ({
  AgentMessage: ({ data }: WidgetAiMessage) => <p>{data.message}</p>,
}));

import { StreamingTurn } from '../StreamingTurn';

let container: HTMLDivElement;
let root: Root;
const writeText = vi.fn(async () => {});
const turn: StreamingTurnState = {
  active: false,
  items: [
    { kind: 'text', text: 'Checking your issues.' },
    {
      kind: 'steps',
      steps: [{ kind: 'tool', label: 'lookup', done: true }],
    },
    { kind: 'text', text: 'Here are the results <ref id="knowledge:2"/>.' },
    { kind: 'spec', parts: [] },
  ],
};
const copyButtons = () =>
  container.querySelectorAll<HTMLButtonElement>('[aria-label="copy_reply"]');
const render = (value: StreamingTurnState) =>
  act(() => root.render(<StreamingTurn turn={value} agent={undefined} />));

beforeEach(() => {
  config.messageActions = undefined;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  writeText.mockClear();
});

it('offers one copy action after the full response finishes and copies all its text', async () => {
  render({ ...turn, active: true });
  expect(copyButtons()).toHaveLength(0);
  render(turn);
  expect(copyButtons()).toHaveLength(1);
  const button = copyButtons().item(0);
  expect(container.firstElementChild?.lastElementChild?.contains(button)).toBe(
    true,
  );
  await act(async () => button.click());
  expect(writeText).toHaveBeenCalledWith(
    'Checking your issues.\n\nHere are the results .',
  );
});

it('honors copy opt-out and skips responses without text', () => {
  render(turn);
  expect(copyButtons()).toHaveLength(1);
  config.messageActions = { copy: false };
  render(turn);
  expect(copyButtons()).toHaveLength(0);
  config.messageActions = { copy: true };
  render({ ...turn, items: turn.items.filter((item) => item.kind !== 'text') });
  expect(copyButtons()).toHaveLength(0);
});
