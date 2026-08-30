import type { useAgentChatUi } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type AgentChatPageEffect = ReturnType<
  typeof useAgentChatUi
>['pageEffects'][number];

let pageEffects: AgentChatPageEffect[] = [];
let enablePageMarks = true;
let pageMarkHighlightDurationMs: number | undefined;

vi.mock('@shardsui/notation', () => ({
  annotate: () => {
    const ink = {
      showing: false,
      finished: Promise.resolve(),
      show: () => ink,
      hide: () => ink,
      remove: () => {},
      update: () => ink,
    };
    return ink;
  },
}));

vi.mock('@opencx/widget-react-headless', () => ({
  useAgentChatUi: () => ({ pageEffects }),
  useConfig: () => ({ enablePageMarks, pageMarkHighlightDurationMs }),
}));

vi.mock('../../../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#123456',
      widgetContentContainer: { zIndex: 100 },
    },
    cssVars: {
      '--opencx-background': '0 0% 100%',
      '--opencx-foreground': '0 0% 10%',
      '--opencx-muted-foreground': '0 0% 40%',
      '--opencx-border': '0 0% 80%',
    },
  }),
}));

import { AgentChatPageEffects } from '../AgentChatPageEffects';

describe('AgentChatPageEffects', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pageEffects = [];
    enablePageMarks = true;
    pageMarkHighlightDurationMs = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
    document
      .querySelectorAll('[data-opencx-overlay]')
      .forEach((element) => element.remove());
  });

  const render = async () => {
    await act(async () => root.render(<AgentChatPageEffects />));
  };

  const addTarget = () => {
    const target = document.createElement('button');
    target.id = 'create-key';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    return target;
  };

  it('performs each normalized effect once with resolved theme layers', async () => {
    const target = addTarget();
    pageEffects = [
      {
        key: 'sess-1:call-1',
        type: 'highlight-element',
        input: { selector: '#create-key', label: 'here' },
      },
    ];
    await render();

    expect(target.scrollIntoView).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('[data-opencx-overlay]')).toHaveLength(1);
    const callout = document.querySelector<HTMLElement>(
      '[data-cx-role="callout"]',
    );
    expect(callout?.style.background).toBe('rgb(255, 255, 255)');
    expect(callout?.style.color).toBe('rgb(26, 26, 26)');
    expect(callout?.style.zIndex).toBe('102');

    pageEffects = [...pageEffects];
    await render();
    expect(target.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('uses the configured highlight duration', async () => {
    vi.useFakeTimers();
    pageMarkHighlightDurationMs = 1250;
    addTarget();
    pageEffects = [
      {
        key: 'sess-1:call-duration',
        type: 'highlight-element',
        input: { selector: '#create-key' },
      },
    ];
    await render();

    const overlays = () => document.querySelectorAll('[data-opencx-overlay]');
    expect(overlays()).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(1249));
    expect(overlays()).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(301));
    expect(overlays()).toHaveLength(0);
  });

  it('does nothing unless page marks are explicitly enabled', async () => {
    enablePageMarks = false;
    const target = addTarget();
    pageEffects = [
      {
        key: 'sess-1:call-disabled',
        type: 'highlight-element',
        input: { selector: '#create-key' },
      },
    ];
    await render();

    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-opencx-overlay]')).toHaveLength(0);
  });
});
