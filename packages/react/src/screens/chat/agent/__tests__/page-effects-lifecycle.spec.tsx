import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
type PageEffect = {
  key: string;
  callId: string;
  type: 'act-on-page' | 'highlight-element';
  input: unknown;
};

const state = vi.hoisted(() => ({
  effects: [] as PageEffect[],
  streaming: true,
  features: { pageContext: true, clientTools: true, pageActions: true },
  reply: vi.fn(),
  consent: vi.fn(async () => true),
  action: vi.fn(async () => ({ outcome: 'done' })),
  highlight: vi.fn(() => true),
  done: vi.fn(),
  travel: vi.fn(),
}));

vi.mock('@opencx/widget-react-headless', () => ({
  useWidget: () => ({ widgetCtx: { features: state.features } }),
  useConfig: () => ({}),
  useAgentChatUi: () => ({
    pageEffects: state.effects,
    isStreaming: state.streaming,
    replyToPageCall: state.reply,
    requestPageActionConsent: state.consent,
  }),
}));
vi.mock('../../../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: { primaryColor: '#111', widgetContentContainer: { zIndex: 100 } },
    cssVars: {},
  }),
}));
vi.mock('../../../../page-controls/cursor', () => ({
  travelTo: state.travel,
  dismissAgentCursor: vi.fn(),
}));
vi.mock('../../../../page-controls/act', () => ({ actOnPage: state.action }));
vi.mock('../../../../page-controls/read-controls', () => ({
  readPageControls: () => ({ controls: [], truncated: false }),
}));
vi.mock('../../../../page-controls/guard', () => ({
  guardRef: () => ({ ok: true, element: document.querySelector('#target') }),
}));
vi.mock('../../../../page-marks/agent-mark', async (original) => ({
  ...(await original<typeof import('../../../../page-marks/agent-mark')>()),
  highlightElementOnHostPage: state.highlight,
  dismissActiveHighlight: vi.fn(),
}));

import { AgentChatPageActions } from '../AgentChatPageActions';
import { AgentChatPageEffects } from '../AgentChatPageEffects';
import { beginSnapshot } from '../../../../page-controls/control-ref';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('page effect lifecycle while the pointer is travelling', () => {
  let root: Root;
  let unmounted: boolean;
  let finishTravel: () => void;
  let ref: string;

  beforeEach(() => {
    vi.clearAllMocks();
    state.streaming = true;
    state.features.pageActions = true;
    state.features.clientTools = true;
    state.features.pageContext = true;
    state.effects = [];
    document.body.innerHTML =
      '<button id="target">Show details</button><div id="mount"></div>';
    const target = document.querySelector<HTMLElement>('#target');
    const mount = document.querySelector<HTMLElement>('#mount');
    if (!target || !mount) throw new Error('fixture missing');
    ref = beginSnapshot()(target);
    root = createRoot(mount);
    unmounted = false;
    state.travel.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishTravel = () => resolve({ done: state.done });
        }),
    );
  });
  afterEach(() => {
    if (!unmounted) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  for (const type of ['act-on-page', 'highlight-element'] as const) {
    const render = () =>
      act(async () =>
        root.render(
          type === 'act-on-page' ? (
            <AgentChatPageActions />
          ) : (
            <AgentChatPageEffects />
          ),
        ),
      );
    const start = async () => {
      state.effects = [
        {
          key: 'session:call',
          callId: 'call',
          type,
          input:
            type === 'act-on-page'
              ? { ref, action: 'click' }
              : { ref, label: 'Here' },
        },
      ];
      await render();
      expect(state.travel).toHaveBeenCalledOnce();
    };

    it(`${type}: performs one live request after travel completes`, async () => {
      await start();
      await act(async () => finishTravel());
      expect(
        type === 'act-on-page' ? state.action : state.highlight,
      ).toHaveBeenCalledOnce();
      expect(state.reply).toHaveBeenCalledWith(
        'call',
        'done',
        ...(type === 'act-on-page'
          ? [undefined, { controls: [], truncated: false }]
          : []),
      );
    });

    it.each(['unmount', 'stop', 'replaced', 'revoke'] as const)(
      `${type}: no late effect after %s`,
      async (reason) => {
        await start();
        if (reason === 'unmount') {
          act(() => root.unmount());
          unmounted = true;
        } else {
          if (reason === 'stop') state.streaming = false;
          if (reason === 'replaced') state.effects = [];
          if (reason === 'revoke') state.features.clientTools = false;
          await render();
        }
        await act(async () => finishTravel());
        expect(state.action).not.toHaveBeenCalled();
        expect(state.highlight).not.toHaveBeenCalled();
      },
    );
  }

  it('pointing permission alone cannot execute a page action', async () => {
    state.features.pageActions = false;
    state.effects = [
      {
        key: 'session:call',
        callId: 'call',
        type: 'act-on-page',
        input: { ref, action: 'click' },
      },
    ];
    await act(async () => root.render(<AgentChatPageActions />));
    expect(state.travel).not.toHaveBeenCalled();
    expect(state.reply).toHaveBeenCalledWith('call', 'declined');
  });

  it('does not commit if the control changes meaning while travelling', async () => {
    state.effects = [
      {
        key: 'session:call',
        callId: 'call',
        type: 'act-on-page',
        input: { ref, action: 'click' },
      },
    ];
    await act(async () => root.render(<AgentChatPageActions />));
    expect(state.travel).toHaveBeenCalledOnce();
    const target = document.querySelector('#target');
    if (!target) throw new Error('target missing');
    target.textContent = 'Delete account';
    await act(async () => finishTravel());
    expect(state.action).not.toHaveBeenCalled();
    expect(state.reply).toHaveBeenCalledWith('call', 'declined');
  });

  it.each(['act-on-page', 'highlight-element'] as const)(
    '%s reports a failed pointer instead of leaving the call pending',
    async (type) => {
      state.travel.mockRejectedValue(new Error('synthetic animation failure'));
      state.effects = [
        {
          key: 'session:call',
          callId: 'call',
          type,
          input: { ref, action: 'click' },
        },
      ];
      await act(async () =>
        root.render(
          type === 'act-on-page' ? (
            <AgentChatPageActions />
          ) : (
            <AgentChatPageEffects />
          ),
        ),
      );
      expect(state.reply).toHaveBeenCalledWith(
        'call',
        'unsupported',
        expect.any(String),
      );
      expect(state.reply).toHaveBeenCalledOnce();
      expect(state.action).not.toHaveBeenCalled();
      expect(state.highlight).not.toHaveBeenCalled();
    },
  );
});
