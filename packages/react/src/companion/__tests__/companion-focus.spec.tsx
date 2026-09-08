import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * A panel that looks ready to type must actually be ready to type. Both panes
 * put the caret in their composer when they open — the quick-ask bar, and
 * (the regression this covers) the conversation you expand into, which used to
 * swallow every keystroke until you clicked the textarea.
 *
 * The iframe, the screens and the stock composer are stubbed down to the one
 * thing this behavior is about: a textarea inside each pane.
 */

vi.mock('../../components/FrameDocument', () => ({
  FrameDocument: ({
    children,
    rootRef,
  }: {
    children: React.ReactNode;
    rootRef: React.RefObject<HTMLDivElement | null>;
  }) => <div ref={rootRef}>{children}</div>,
}));

vi.mock('../../screens', () => ({
  RootScreen: () => <textarea data-testid="chat-composer" />,
}));

vi.mock('../../screens/chat/ChatInput', () => ({
  ChatInput: ({ trailingActions }: { trailingActions?: React.ReactNode }) => (
    <div>
      <textarea data-testid="quick-ask-composer" />
      {trailingActions}
    </div>
  ),
}));

vi.mock('../PanelControls', () => ({ PanelControls: () => null }));

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ companion: undefined }),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../components/lib/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

import { CompanionContent } from '../CompanionContent';

describe('companion composer focus', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(
    state: 'input' | 'chat',
    { canExpand = false }: { canExpand?: boolean } = {},
  ) {
    act(() => {
      root.render(
        <CompanionContent
          state={state}
          layout="compact"
          shellRadius={20}
          onMinimize={() => {}}
          onDismiss={() => {}}
          onToggleFullscreen={() => {}}
          onSelectLayout={() => {}}
          onExpand={() => {}}
          canExpand={canExpand}
          placeholder="Ask…"
          hideAttachTools={false}
          onInputHeightChange={() => {}}
        />,
      );
    });
  }

  const focused = () =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset['testid']
      : undefined;

  it('focuses the quick-ask composer when the resting bar opens', () => {
    render('input');
    expect(focused()).toBe('quick-ask-composer');
  });

  it('focuses the conversation composer when the panel expands into chat', () => {
    render('input', { canExpand: true }); // minimized mid-conversation
    expect(focused()).not.toBe('quick-ask-composer');

    render('chat');
    expect(focused()).toBe('chat-composer');
  });

  it('focuses the conversation composer when the panel opens straight into chat', () => {
    render('chat');
    expect(focused()).toBe('chat-composer');
  });
});
