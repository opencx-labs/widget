import type { WidgetAiMessage } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let messageActions:
  | { copy?: boolean; display?: 'hover' | 'always' }
  | undefined;
let displayMode: 'popover' | 'companion' = 'popover';

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ messageActions }),
  useDisplayMode: () => displayMode,
}));
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
vi.mock('../lib/tooltip', () => ({
  Tooltippy: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import {
  MessageActions,
  replyText,
  useShowsCopyAction,
} from '../MessageActions';

function ai(text: string): WidgetAiMessage {
  return {
    id: `m-${text}`,
    type: 'AI',
    component: 'bot_message',
    timestamp: null,
    data: { message: text },
  };
}

describe('replyText', () => {
  it('joins the group as text with citation tags removed', () => {
    expect(
      replyText([
        ai('Your order <ref id="knowledge:2"/> shipped.'),
        ai('  '),
        ai('Anything else?'),
      ]),
    ).toBe('Your order  shipped.\n\nAnything else?');
  });
});

describe('useShowsCopyAction', () => {
  let captured: boolean | null = null;
  function Probe() {
    captured = useShowsCopyAction();
    return null;
  }
  function renderProbe() {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    act(() => root.unmount());
    return captured;
  }

  it('defaults on in the companion and off in the popover', () => {
    messageActions = undefined;
    displayMode = 'companion';
    expect(renderProbe()).toBe(true);
    displayMode = 'popover';
    expect(renderProbe()).toBe(false);
  });

  it('honors an explicit messageActions.copy in either mode', () => {
    displayMode = 'companion';
    messageActions = { copy: false };
    expect(renderProbe()).toBe(false);
    displayMode = 'popover';
    messageActions = { copy: true };
    expect(renderProbe()).toBe(true);
  });
});

describe('MessageActions', () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn(async () => {});

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    writeText.mockClear();
  });

  const button = () =>
    container.querySelector<HTMLButtonElement>(
      '[data-component="chat/agent_msg_group/actions/copy"]',
    );

  it('copies the reply and reads "copied" for two seconds', async () => {
    act(() => root.render(<MessageActions messages={[ai('Hello there')]} />));
    expect(button()?.getAttribute('aria-label')).toBe('copy_reply');

    await act(async () => button()?.click());
    expect(writeText).toHaveBeenCalledWith('Hello there');
    expect(button()?.getAttribute('aria-label')).toBe('copied');

    await act(async () => vi.advanceTimersByTime(2001));
    expect(button()?.getAttribute('aria-label')).toBe('copy_reply');
  });

  it('hides until hover by default and stays visible with display: always', () => {
    messageActions = undefined;
    act(() => root.render(<MessageActions messages={[ai('Hello')]} />));
    const row = () =>
      container.querySelector(
        '[data-component="chat/agent_msg_group/actions"]',
      );
    expect(row()?.className).toContain('opacity-0');

    messageActions = { display: 'always' };
    act(() => root.render(<MessageActions messages={[ai('Hello again')]} />));
    expect(row()?.className).not.toContain('opacity-0');
  });

  it('renders nothing for an empty reply', () => {
    act(() => root.render(<MessageActions messages={[ai('   ')]} />));
    expect(button()).toBeNull();
  });
});
