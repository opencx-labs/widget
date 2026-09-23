import type { WidgetConfig, WidgetMessageU } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let config: WidgetConfig;
let messages: WidgetMessageU[];
let session: { id: string } | null;
const setIsOpen = vi.fn();
const setLayout = vi.fn();
const widgetCtx = {
  sessionCtx: { sessionState: { get: () => ({ session }) } },
  routerCtx: { state: { get: () => ({ screen: 'chat' }) } },
};

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => config,
  useMessages: () => ({ messagesState: { messages } }),
  useSessions: () => ({ sessionState: { session } }),
  useWidget: () => ({ widgetCtx }),
  useCompanionChats: () => ({ openChats: [], activeId: 1 }),
  useWidgetTrigger: () => ({ isOpen: false, setIsOpen }),
  useWidgetLayout: () => ({
    layout: 'compact',
    defaultLayout: 'compact',
    allowedLayouts: ['compact'],
    setLayout,
    sidebarSide: 'right',
  }),
}));
vi.mock('../../components/FrameDocument', () => ({ buildFrameHtml: () => '' }));
vi.mock('../CompanionFrame', () => ({
  CompanionFrame: ({ children }: { children: React.ReactNode }) => children,
}));
// The shell chooses which pane mounts; the pane/composer behavior has separate
// coverage. Keep the real launch and minimize controls in this test.
vi.mock('../CompanionContent', () => ({
  CompanionContent: ({
    state,
    onMinimize,
  }: {
    state: string;
    onMinimize: () => void;
  }) => (
    <div data-pane={state}>
      <button data-minimize onClick={onMinimize}>
        Minimize
      </button>
    </div>
  ),
}));
vi.mock('../RestingPill', () => ({ RestingPill: () => null }));
vi.mock('../ChatPicker', () => ({ ChatPicker: () => null }));
vi.mock('../../page-marks/PageMarksProvider', () => ({
  usePageMarks: () => ({ isArmed: false }),
}));
vi.mock('../../hooks/useCanHover', () => ({ useCanHover: () => false }));
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    cssVars: {},
    theme: {
      widgetContentContainer: { zIndex: 1000 },
      widgetTrigger: { offset: { bottom: 20 } },
    },
  }),
}));
vi.mock('../useCompanionMeasurements', () => ({
  useCompanionMeasurements: () => ({
    region: { width: 1200, height: 900, top: 0, left: 0 },
    dockWidth: 300,
  }),
}));
vi.mock('../useCompanionHostEffects', () => ({
  useCompanionHostEffects: () => ({ sidebarWidth: 400 }),
}));
vi.mock('../usePersistedPillDrag', () => ({
  usePersistedPillDrag: () => ({ dragX: 0, shouldIgnoreLaunch: () => false }),
}));

import { WidgetCompanion } from '../WidgetCompanion';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  config = {
    token: 'test',
    initialQuestions: ['Track my order'],
    requireInitialQuestion: true,
  };
  messages = [];
  session = null;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render() {
  act(() => root.render(<WidgetCompanion />));
}
function click(selector: string) {
  act(() => document.querySelector<HTMLButtonElement>(selector)!.click());
}
const pane = () =>
  document.querySelector('[data-pane]')?.getAttribute('data-pane');

describe('companion with required initial questions', () => {
  it('opens the full chat and can collapse before a choice', () => {
    render();
    click('[data-companion-launcher]');
    expect(pane()).toBe('chat');
    click('[data-minimize]');
    expect(pane()).toBeUndefined();
    click('[data-companion-launcher]');
    expect(pane()).toBe('chat');
  });

  it('keeps the quick-ask bar when the option is off', () => {
    config.requireInitialQuestion = false;
    render();
    click('[data-companion-launcher]');
    expect(pane()).toBe('input');
  });

  it('keeps the quick-ask bar when no usable questions are configured', () => {
    config.initialQuestions = ['  '];
    render();
    click('[data-companion-launcher]');
    expect(pane()).toBe('input');
  });

  it('shows the questions when the option is enabled with quick-ask open', () => {
    config.requireInitialQuestion = false;
    render();
    click('[data-companion-launcher]');
    expect(pane()).toBe('input');
    config.requireInitialQuestion = true;
    render();
    expect(pane()).toBe('chat');
  });

  it('allows the follow-up bar after a question, but closes fully after a rollback', () => {
    session = { id: 'session' };
    messages = [
      {
        id: 'question',
        type: 'USER',
        content: 'Track my order',
        timestamp: null,
      },
    ];
    render();
    click('[data-companion-launcher]');
    click('[data-minimize]');
    expect(pane()).toBe('input');

    messages = [];
    render();
    expect(pane()).toBe('chat');
    click('[data-minimize]');
    expect(pane()).toBeUndefined();
  });
});
