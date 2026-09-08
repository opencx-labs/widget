import type {
  AgentTurnMessagesDto,
  WidgetConfig,
  SendMessageInput,
  StagedUserTurn,
  WidgetCtx,
  WidgetMessageU,
  WidgetUserMessage,
} from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The stream-end RETENTION contract (widget v5 transcript fidelity):
 *
 * The stream's terminal `data-turn-settled` part identifies the turn and its
 * persisted rows. At the turn boundary the streamed message becomes those
 * rows' render source SYNCHRONOUSLY — `turnSources` gains a source under the
 * live node's key (no swap, chips survive, no follow-up fetch) — and the
 * overlay stands down once the rows land. A stream WITHOUT the part (older
 * backend, failed turn) retains nothing: overlay down at row-landing, rows
 * render plainly — the pre-feature behavior.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

/** A streamed turn WITH a tool call — the chips whose survival this guards. */
const ASSISTANT_PARTS = [
  { type: 'text', text: 'Let me count your sessions.', state: 'done' },
  {
    type: 'tool-count_sessions',
    toolCallId: 'c1',
    state: 'output-available',
    input: {},
    output: { count: 42 },
  },
  { type: 'text', text: 'You have 42 sessions.', state: 'done' },
];

/** The same turn as the backend streams it: terminal turn-identity part. */
const ASSISTANT_TURN = [
  {
    role: 'assistant',
    parts: [
      ...ASSISTANT_PARTS,
      {
        type: 'data-turn-settled',
        data: { turn_id: 'T1', message_uuids: ['r-a1'] },
      },
    ],
  },
];

/** A turn that never settled (it failed): no turn identity, nothing to retain. */
const ASSISTANT_TURN_WITHOUT_IDENTITY = [
  { role: 'assistant', parts: ASSISTANT_PARTS },
];

type PersistedRow = { id: string; type: 'USER' | 'AI' | 'AGENT' | 'SYSTEM' };

const sendMessageSpy = vi.fn();
const stopSpy = vi.fn();
let setChatState: (next: ChatState) => void = () => {};
let setTranscript: (next: PersistedRow[]) => void = () => {};

vi.mock('@ai-sdk/react', () => ({
  useChat: () => {
    const [state, setState] = React.useState<ChatState>({
      status: 'ready',
      messages: [],
    });
    setChatState = setState;
    return { ...state, sendMessage: sendMessageSpy, stop: stopSpy };
  },
}));

function buildUserMessage(content: string): WidgetUserMessage {
  return {
    id: `msg-${content}`,
    type: 'USER',
    content,
    timestamp: new Date().toISOString(),
    pending: true,
  };
}

const fakeReconcileAfterStream = vi.fn(async () => {});

/** Per-test wiring for the v5 messages endpoint. */
const getAgentTurnMessages = vi.fn<() => Promise<AgentTurnMessagesDto | null>>(
  async () => null,
);

const fakeMessageCtx = {
  stageUserTurn: vi.fn(
    async (input: SendMessageInput): Promise<StagedUserTurn | null> => ({
      sessionId: 'sess-1',
      userMessage: buildUserMessage(input.content),
      initialMessages: [],
    }),
  ),
  buildQueuedUserMessage: vi.fn((input: SendMessageInput) => ({
    sessionId: 'sess-1',
    userMessage: buildUserMessage(input.content),
  })),
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessageDelivered: vi.fn(),
  notifySendAccepted: vi.fn((input: SendMessageInput) => input.onAccepted?.()),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

function registeredSend(): (input: SendMessageInput) => Promise<void> | void {
  const handlers = fakeMessageCtx.registerAgentHandlers.mock.calls.at(-1)?.[0];
  if (!handlers) throw new Error('agent handlers were never registered');
  return handlers.send;
}

// Stable, module-level widgetCtx — the production `WidgetCtx.api` is created
// once, and the hook's effects rightly assume a stable identity.
const fakeWidgetCtx = {
  api: {
    getStreamTransportOptions: () => ({
      api: 'http://test/chat',
      reconnectApi: (id: string) => `http://test/chat/${id}`,
      headers: {},
    }),
    stopStream: vi.fn(async () => {}),
    getAgentTurnMessages,
  },
  messageCtx: fakeMessageCtx,
  reconcileAfterStream: fakeReconcileAfterStream,
  // Org features on, embed silent (WidgetCtx getters).
  features: {
    dictation: false,
    attachments: true,
    pageContext: true,
    clientTools: true,
  },
};

import { useAgentChat } from '../useAgentChat';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

function Probe({
  presentation,
}: {
  presentation?: WidgetConfig['presentation'];
}) {
  const [rows, setRows] = React.useState<PersistedRow[]>([]);
  setTranscript = setRows;
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx as unknown as WidgetCtx,
    config: { token: 't', presentation },
    sessionId: 'sess-1',
    persistedMessages: rows as unknown as WidgetMessageU[],
  });
  return null;
}

/** Drive one full turn: send → stream → ready → row lands. */
async function runTurn({
  rowId,
  messages = ASSISTANT_TURN,
}: {
  rowId: string;
  messages?: unknown[];
}) {
  await act(async () => {
    await registeredSend()({ content: 'hey' });
  });
  await act(async () => {
    setTranscript([{ id: 'u1', type: 'USER' }]);
    setChatState({ status: 'streaming', messages });
  });
  await act(async () => {
    setChatState({ status: 'ready', messages });
  });
  await act(async () => {
    setTranscript([
      { id: 'u1', type: 'USER' },
      { id: rowId, type: 'AI' },
    ]);
  });
}

describe('useAgentChat turn retention', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    getAgentTurnMessages.mockImplementation(async () => null);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
    if (!hookValue) throw new Error('hook did not render');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('retains the streamed message synchronously from the terminal turn-identity part', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    await act(async () => {
      setTranscript([{ id: 'u1', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    // The live node key is up as soon as the send drains — the same key the
    // retained source must carry (React identity through the promotion).
    expect(hookValue?.liveTurnKey).toBe('turn-msg-hey');
    expect(hookValue?.liveItems.length).toBeGreaterThan(0);

    await act(async () => {
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
    });
    // Retention happened AT THE BOUNDARY — before the rows landed, with no
    // network round-trip. The overlay stays up (nothing to hand off to yet).
    expect(hookValue?.turnSources).toHaveLength(1);
    expect(hookValue?.liveItems.length).toBeGreaterThan(0);
    expect(getAgentTurnMessages).toHaveBeenCalledTimes(1); // session-open only

    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'r-a1', type: 'AI' },
      ]);
    });

    // Rows landed → overlay released; the turn lives on as a source: SAME
    // key, the STREAMED items (tool chip included), the wire-mapped rows.
    // The turn-identity part itself never renders as an item.
    expect(hookValue?.liveItems).toEqual([]);
    expect(hookValue?.liveTurnKey).toBeNull();
    const source = hookValue?.turnSources[0];
    expect(source?.key).toBe('turn-msg-hey');
    expect(source?.turnId).toBe('T1');
    expect(source?.rowIds).toEqual(['r-a1']);
    expect(source?.items).toEqual([
      { kind: 'text', text: 'Let me count your sessions.' },
      {
        kind: 'steps',
        steps: [
          {
            kind: 'tool',
            label: 'count_sessions',
            done: true,
            input: {},
            output: { count: 42 },
          },
        ],
      },
      { kind: 'text', text: 'You have 42 sessions.' },
    ]);
  });

  it('a stream that ends without a turn-identity part falls back to the plain swap', async () => {
    await runTurn({ rowId: 'r-a1', messages: ASSISTANT_TURN_WITHOUT_IDENTITY });

    expect(hookValue?.liveItems).toEqual([]);
    expect(hookValue?.turnSources).toEqual([]);
  });

  it('reload path: historical turns with ui_parts become sources on session open', async () => {
    getAgentTurnMessages.mockImplementation(async () => ({
      turns: [
        {
          turn_id: 'T0',
          ui_parts: [
            { type: 'text', text: 'Historic answer.', state: 'done' },
            {
              type: 'tool-lookup',
              toolCallId: 'c0',
              state: 'output-available',
              input: {},
              output: {},
            },
          ],
          message_uuids: ['r-old'],
        },
      ],
    }));

    // Remount: a fresh session open runs the historical fetch.
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });

    expect(getAgentTurnMessages).toHaveBeenCalledWith('sess-1');
    expect(hookValue?.turnSources).toHaveLength(1);
    const source = hookValue?.turnSources[0];
    expect(source?.key).toBe('turn-T0');
    expect(source?.rowIds).toEqual(['r-old']);
    expect(source?.items).toEqual([
      { kind: 'text', text: 'Historic answer.' },
      {
        kind: 'steps',
        steps: [
          { kind: 'tool', label: 'lookup', done: true, input: {}, output: {} },
        ],
      },
    ]);
  });

  it('preserves a retained turn when a delayed historical snapshot does not include it', async () => {
    let resolveHistoricalFetch: (
      value: AgentTurnMessagesDto,
    ) => void = () => {};
    getAgentTurnMessages.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHistoricalFetch = resolve;
        }),
    );

    // Remount so the session-open request above remains pending while a newer
    // turn streams and retains itself from data-turn-settled.
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
    await runTurn({ rowId: 'r-a1' });
    expect(hookValue?.turnSources.map((source) => source.turnId)).toEqual([
      'T1',
    ]);

    await act(async () => {
      resolveHistoricalFetch({
        turns: [
          {
            turn_id: 'T0',
            ui_parts: [
              { type: 'text', text: 'Historic answer.', state: 'done' },
            ],
            message_uuids: ['r-old'],
          },
        ],
      });
      await Promise.resolve();
    });

    expect(hookValue?.turnSources.map((source) => source.turnId)).toEqual([
      'T0',
      'T1',
    ]);
    expect(hookValue?.turnSources[1]?.key).toBe('turn-msg-hey');
  });
});

it('refreshes historical payloads when presentation changes and preserves the turn identity', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const payload = (details: boolean): AgentTurnMessagesDto => ({
    turns: [
      {
        turn_id: 'T0',
        message_uuids: ['r-old'],
        ui_parts: [
          { type: 'text', text: 'Historic answer.' },
          ...(details
            ? [
                {
                  type: 'tool-lookup',
                  toolCallId: 'c0',
                  state: 'output-available',
                  input: { secret: 'input-canary' },
                  output: { secret: 'output-canary' },
                },
                { type: 'reasoning', text: 'reasoning-canary' },
              ]
            : []),
        ],
      },
    ],
  });
  getAgentTurnMessages.mockClear();
  getAgentTurnMessages
    .mockResolvedValueOnce(payload(false))
    .mockResolvedValueOnce(payload(true))
    .mockResolvedValueOnce(payload(false));
  try {
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'hidden', reasoning: false }} />,
      ),
    );
    const key = hookValue?.turnSources[0]?.key;
    expect(hookValue?.turnSources[0]?.items).toEqual([
      { kind: 'text', text: 'Historic answer.' },
    ]);
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'details', reasoning: true }} />,
      ),
    );
    expect(getAgentTurnMessages).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(hookValue?.turnSources)).toContain('input-canary');
    expect(hookValue?.turnSources[0]?.key).toBe(key);
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'hidden', reasoning: false }} />,
      ),
    );
    expect(getAgentTurnMessages).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(hookValue?.turnSources)).not.toContain('canary');
    expect(hookValue?.turnSources[0]?.key).toBe(key);
  } finally {
    act(() => root.unmount());
  }
});

it('immediately hides cached details and ignores late responses from superseded visibility requests', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const details: AgentTurnMessagesDto = {
    turns: [
      {
        turn_id: 'T0',
        message_uuids: ['r-old'],
        ui_parts: [
          { type: 'text', text: 'Historic answer.' },
          {
            type: 'tool-lookup',
            state: 'output-available',
            toolCallId: 't',
            input: { secret: 'canary' },
          },
          { type: 'reasoning', text: 'reasoning-canary' },
        ],
      },
    ],
  };
  const hidden: AgentTurnMessagesDto = {
    turns: [
      {
        turn_id: 'T0',
        message_uuids: ['r-old'],
        ui_parts: [{ type: 'text', text: 'Historic answer.' }],
      },
    ],
  };
  let finishOldHidden: (response: AgentTurnMessagesDto) => void = () => {};
  let finishOldDetails: (response: AgentTurnMessagesDto) => void = () => {};
  getAgentTurnMessages.mockClear();
  getAgentTurnMessages
    .mockResolvedValueOnce(details)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldHidden = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldDetails = resolve;
        }),
    )
    .mockResolvedValueOnce(hidden);
  try {
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'details', reasoning: true }} />,
      ),
    );
    expect(JSON.stringify(hookValue?.turnSources)).toContain('canary');
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'hidden', reasoning: false }} />,
      ),
    );
    expect(JSON.stringify(hookValue?.turnSources)).not.toContain('canary');
    expect(JSON.stringify(hookValue?.turnSources)).toContain(
      'Historic answer.',
    );
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'details', reasoning: true }} />,
      ),
    );
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'hidden', reasoning: false }} />,
      ),
    );
    await act(async () => {
      finishOldHidden(hidden);
      finishOldDetails(details);
    });
    expect(getAgentTurnMessages).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(hookValue?.turnSources)).not.toContain('canary');
    expect(hookValue?.turnSources[0]?.key).toBe('turn-T0');
  } finally {
    act(() => root.unmount());
  }
});

it('narrows live tool status immediately even when the history refresh fails', async () => {
  const root = createRoot(document.createElement('div'));
  getAgentTurnMessages.mockClear();
  getAgentTurnMessages
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('history unavailable'));
  try {
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'details', reasoning: true }} />,
      ),
    );
    await act(async () =>
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN }),
    );
    expect(JSON.stringify(hookValue?.liveItems)).toContain('"count":42');
    await act(async () =>
      root.render(
        <Probe presentation={{ toolActivity: 'status', reasoning: false }} />,
      ),
    );
    expect(JSON.stringify(hookValue?.liveItems)).not.toContain('"count":42');
    expect(hookValue?.liveItems).toEqual([
      { kind: 'text', text: 'Let me count your sessions.' },
      {
        kind: 'steps',
        steps: [{ kind: 'tool', label: 'count_sessions', done: true }],
      },
      { kind: 'text', text: 'You have 42 sessions.' },
    ]);
  } finally {
    act(() => root.unmount());
  }
});
