import type { WidgetMessageU } from '@opencx/widget-core';
import type {
  TurnRenderSource,
  useAgentChatUi,
} from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type AgentChatUiValue = ReturnType<typeof useAgentChatUi>;
type StreamingTurnItem = AgentChatUiValue['liveItems'][number];

/**
 * The live→retained PROMOTION must move data, never the node: when a finished
 * turn's overlay hands off to its retained render source, the `StreamingTurn`
 * node keeps its React identity (same key, same keyed sequence) — an
 * unmount/remount here IS the flash this feature removes. Also locks the
 * suppression rule: rows covered by a source never render their plain
 * bubbles, uncovered rows still do.
 */

const mounts: string[] = [];
const unmounts: string[] = [];
let renderedTurnProps: Array<{
  marker: string;
  active: boolean;
  items: StreamingTurnItem[];
}> = [];

vi.mock('../../../../components/StreamingTurn', () => ({
  StreamingTurn: ({
    turn,
  }: {
    turn: { active: boolean; items: StreamingTurnItem[] };
  }) => {
    // Instance identity marker: created once per MOUNTED component instance.
    const markerRef = React.useRef(
      `instance-${Math.random().toString(36).slice(2)}`,
    );
    React.useEffect(() => {
      const marker = markerRef.current;
      mounts.push(marker);
      return () => {
        unmounts.push(marker);
      };
    }, []);
    renderedTurnProps.push({
      marker: markerRef.current,
      active: turn.active,
      items: turn.items,
    });
    return <div data-marker={markerRef.current} />;
  },
}));

vi.mock('../../MessageGroups', () => ({
  MessageGroups: ({ groups }: { groups: WidgetMessageU[][] }) => (
    <div data-testid="group">
      {groups
        .flat()
        .map((message) => message.id)
        .join(',')}
    </div>
  ),
}));

vi.mock('../../ChatCustomStatus', () => ({
  ChatCustomStatus: () => <div data-testid="custom-status" />,
}));
vi.mock('../../ChatBannerItems', () => ({
  ChatBannerItems: () => <div data-testid="banner-items" />,
}));
vi.mock('../../InitialMessages', () => ({
  InitialMessages: () => <div data-testid="initial-messages" />,
}));
vi.mock(
  '../../../../components/custom-components/ChatBottomComponents',
  () => ({
    ChatBottomComponents: () => null,
  }),
);
vi.mock(
  '../../../../components/custom-components/SessionResolvedComponent',
  () => ({
    SessionResolvedComponent: () => null,
  }),
);
vi.mock('../useStreamFollow', () => ({
  useStreamFollow: () => ({
    containerRef: { current: null },
    handleScroll: () => {},
    showScrollDown: false,
    scrollToBottom: () => {},
  }),
}));

let transcript: WidgetMessageU[] = [];
let uiValue: AgentChatUiValue;

vi.mock('@opencx/widget-react-headless', () => ({
  useAgentChatUi: () => uiValue,
  useMessages: () => ({ messagesState: { messages: transcript } }),
  useBot: () => undefined,
  useWidget: () => ({
    componentStore: { getComponent: () => null },
  }),
  // The failed-turn row is localized, so `useTranslation` is on this
  // component's dependency path.
  useConfig: () => ({}),
  useDocumentDir: () => ({ dir: 'ltr' }),
}));

import { AgentChatMain } from '../AgentChatMain';

const userRow: WidgetMessageU = {
  id: 'u1',
  type: 'USER',
  content: 'how many sessions?',
  timestamp: null,
};
const aiRow: WidgetMessageU = {
  id: 'r-a1',
  type: 'AI',
  component: 'bot_message',
  data: { message: 'You have 42 sessions.' },
  timestamp: null,
};

const STREAMED_ITEMS: StreamingTurnItem[] = [
  { kind: 'text', text: 'Let me count your sessions.' },
  {
    kind: 'steps',
    steps: [{ kind: 'tool', label: 'count_sessions', done: true }],
  },
  { kind: 'text', text: 'You have 42 sessions.' },
];

function ui(partial: Partial<AgentChatUiValue>): AgentChatUiValue {
  return {
    isStreaming: false,
    liveItems: [],
    turnSources: [],
    liveTurnKey: null,
    turnFailed: false,
    retryFailedTurn: () => {},
    queuedUserMessages: [],
    removeQueued: () => {},
    stop: () => {},
    pageEffects: [],
    pendingClarification: null,
    ...partial,
  };
}

describe('AgentChatMain live→retained promotion', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mounts.length = 0;
    unmounts.length = 0;
    renderedTurnProps = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the shared chat chrome ahead of the v5 transcript', async () => {
    transcript = [];
    uiValue = ui({});

    await act(async () => {
      root.render(<AgentChatMain />);
    });

    const messageRoot = container.querySelector(
      '[data-component="chat/msgs/root"]',
    );
    expect(
      Array.from(messageRoot?.children ?? []).map((node) =>
        node.getAttribute('data-testid'),
      ),
    ).toEqual(['custom-status', 'banner-items', 'initial-messages']);
  });

  it('keeps the SAME StreamingTurn instance across the promotion — no unmount, no remount', async () => {
    // Phase 1 — live: the overlay owns the turn; its row already polled in
    // mid-stream and must not render a plain copy.
    transcript = [userRow, aiRow];
    uiValue = ui({
      isStreaming: true,
      liveItems: STREAMED_ITEMS,
      liveTurnKey: 'turn-msg-hey',
    });
    await act(async () => {
      root.render(<AgentChatMain />);
    });
    expect(mounts).toHaveLength(1);
    const liveMarker = mounts[0];
    // The polled AI row is suppressed while the overlay owns the region.
    const groupsWhileLive = Array.from(
      container.querySelectorAll('[data-testid="group"]'),
    ).map((node) => node.textContent);
    expect(groupsWhileLive).toEqual(['u1']);

    // Phase 2 — promoted: overlay down, retained source up under the SAME key.
    transcript = [userRow, aiRow];
    uiValue = ui({
      turnSources: [
        {
          key: 'turn-msg-hey',
          turnId: 'T1',
          rowIds: ['r-a1'],
          items: STREAMED_ITEMS,
        } satisfies TurnRenderSource,
      ],
    });
    await act(async () => {
      root.render(<AgentChatMain />);
    });

    // THE assertion: the node survived the promotion. One mount ever, zero
    // unmounts, and the same instance now renders the retained (inactive) turn.
    expect(unmounts).toEqual([]);
    expect(mounts).toHaveLength(1);
    const lastRender = renderedTurnProps.at(-1);
    expect(lastRender?.marker).toBe(liveMarker);
    expect(lastRender?.active).toBe(false);
    expect(lastRender?.items).toEqual(STREAMED_ITEMS);
    // The covered row still renders no plain bubble.
    const groupsAfter = Array.from(
      container.querySelectorAll('[data-testid="group"]'),
    ).map((node) => node.textContent);
    expect(groupsAfter).toEqual(['u1']);
  });

  it('one owner per key: overlay + same-key source never render twice, before OR after rows land', async () => {
    // Pre-landing: the turn was retained at the boundary but its rows have
    // not polled in — the overlay still owns the region, the source (with
    // nothing to anchor to) renders nothing.
    transcript = [userRow];
    uiValue = ui({
      liveItems: STREAMED_ITEMS,
      liveTurnKey: 'turn-msg-hey',
      turnSources: [
        {
          key: 'turn-msg-hey',
          turnId: 'T1',
          rowIds: ['r-a1'],
          items: STREAMED_ITEMS,
        },
      ],
    });
    await act(async () => {
      root.render(<AgentChatMain />);
    });
    expect(mounts).toHaveLength(1);
    const liveMarker = mounts[0];

    // Rows land while `settling` still holds the overlay up (the release
    // effect flips it a commit later) — the SOURCE takes the key and the
    // overlay stands down in the same commit: still exactly one node, the
    // same instance.
    transcript = [userRow, aiRow];
    await act(async () => {
      root.render(<AgentChatMain />);
    });
    expect(unmounts).toEqual([]);
    expect(mounts).toHaveLength(1);
    expect(renderedTurnProps.at(-1)?.marker).toBe(liveMarker);
    expect(renderedTurnProps.at(-1)?.active).toBe(false);
  });

  it('renders uncovered rows plainly, covered rows through their source, in transcript order', async () => {
    const humanRow: WidgetMessageU = {
      id: 'h1',
      type: 'AGENT',
      component: 'agent_message',
      data: { message: 'A human reply.' },
      timestamp: null,
    };
    transcript = [userRow, aiRow, humanRow];
    uiValue = ui({
      turnSources: [
        {
          key: 'turn-T1',
          turnId: 'T1',
          rowIds: ['r-a1'],
          items: STREAMED_ITEMS,
        },
      ],
    });
    await act(async () => {
      root.render(<AgentChatMain />);
    });

    // One StreamingTurn (the covered AI row), and the human row kept its
    // plain rendering — sources never swallow rows they don't cover.
    expect(mounts).toHaveLength(1);
    const groups = Array.from(
      container.querySelectorAll('[data-testid="group"]'),
    ).map((node) => node.textContent);
    expect(groups).toEqual(['u1', 'h1']);
  });
});
