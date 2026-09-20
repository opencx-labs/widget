import type { useAgentChatUi } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type AgentChatPageEffect = ReturnType<
  typeof useAgentChatUi
>['pageEffects'][number];

let pageEffects: AgentChatPageEffect[] = [];
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

/** What the adapter told the waiting turn, in order. */
let replies: Array<{ callId: string; outcome: string }> = [];

vi.mock('@opencx/widget-react-headless', () => ({
  useAgentChatUi: () => ({
    pageEffects,
    replyToPageCall: (callId: string, outcome: string) =>
      replies.push({ callId, outcome }),
  }),
  useConfig: () => ({ pageMarkHighlightDurationMs }),
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
import {
  beginSnapshot,
  resetRefsForTest,
} from '../../../../page-controls/control-ref';

describe('AgentChatPageEffects', () => {
  // The pointer's travel is real time. These specs assert what the adapter
  // DOES, not how long it looks good for, so they run the reduced-motion
  // path where the gesture is instant. Its own timing is covered by the
  // browser-mode cursor spec.
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pageEffects = [];
    replies = [];
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

  /**
   * A control the page reader has already offered the agent: mounted, given
   * a real box (jsdom lays nothing out, and the guard asks for one before it
   * lets the ink down), and registered so its reference resolves.
   */
  const addTarget = () => {
    const target = document.createElement('button');
    target.id = 'create-key';
    target.scrollIntoView = vi.fn();
    target.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 10,
        left: 10,
        top: 10,
        width: 80,
        height: 32,
        right: 90,
        bottom: 42,
      }) as DOMRect;
    document.body.appendChild(target);
    resetRefsForTest();
    const ref = beginSnapshot()(target);
    return { target, ref };
  };

  it('performs each normalized effect once with resolved theme layers', async () => {
    const { target, ref } = addTarget();
    pageEffects = [
      {
        key: 'sess-1:call-1',
        callId: 'call-1',
        type: 'highlight-element',
        input: { ref, label: 'here' },
      },
    ];
    await render();
    // The pointer travels before the ink goes down, so the mark arrives a
    // tick later than the render.
    await vi.waitFor(() =>
      expect(document.querySelector('[data-cx-role="callout"]')).not.toBeNull(),
    );

    expect(target.scrollIntoView).toHaveBeenCalled();
    const callout = document.querySelector<HTMLElement>(
      '[data-cx-role="callout"]',
    );
    expect(callout?.style.background).toBe('rgb(255, 255, 255)');
    expect(callout?.style.color).toBe('rgb(26, 26, 26)');
    // Ink sits two under the widget (100); the callout one above the ink.
    expect(callout?.style.zIndex).toBe('99');

    // The turn asked; the turn is told.
    await vi.waitFor(() =>
      expect(replies).toEqual([
        { callId: 'call-1', outcome: 'done', detail: undefined },
      ]),
    );

    pageEffects = [...pageEffects];
    await render();
    // ...and told exactly once, however many times it re-renders.
    expect(replies).toHaveLength(1);
  });

  it('uses the configured highlight duration', async () => {
    vi.useFakeTimers();
    pageMarkHighlightDurationMs = 1250;
    const { ref } = addTarget();
    pageEffects = [
      {
        key: 'sess-1:call-duration',
        callId: 'call-duration',
        type: 'highlight-element',
        input: { ref },
      },
    ];
    await render();

    // The ink, not the pointer — both are widget overlays and only the
    // ink's lifetime is what this test is about.
    const overlays = () =>
      document.querySelectorAll(
        '[data-opencx-overlay]:not([data-opencx-cursor])',
      );
    await vi.waitFor(() => expect(overlays()).toHaveLength(1));
    await act(async () => vi.advanceTimersByTime(1249));
    expect(overlays()).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(301));
    expect(overlays()).toHaveLength(0);
  });

  // A reference is not a permission slip: the element is looked up and
  // re-checked at the instant of drawing, so a page that moved on between
  // the reading and the tool call gets no mark at all.
  it('draws nothing when the reference no longer means anything', async () => {
    const { target, ref } = addTarget();
    target.remove();
    pageEffects = [
      {
        key: 'sess-1:call-stale',
        callId: 'call-stale',
        type: 'highlight-element',
        input: { ref },
      },
    ];
    await render();

    expect(document.querySelectorAll('[data-opencx-overlay]')).toHaveLength(0);
    // Not silence: the turn is told WHICH no it was.
    expect(replies).toEqual([
      { callId: 'call-stale', outcome: 'gone', detail: undefined },
    ]);
  });

  it('draws nothing for a reference the reader never handed out', async () => {
    addTarget();
    pageEffects = [
      {
        key: 'sess-1:call-forged',
        callId: 'call-forged',
        type: 'highlight-element',
        input: { ref: '#create-key' },
      },
    ];
    await render();

    expect(document.querySelectorAll('[data-opencx-overlay]')).toHaveLength(0);
    expect(replies).toEqual([{ callId: 'call-forged', outcome: 'gone' }]);
  });
});
