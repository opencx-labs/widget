import type {
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
 * Regression: the finished turn has TWO possible renderers — the live overlay
 * (`liveItems` → `StreamingTurn`) and the canonical rows the post-turn
 * reconcile ingests — and exactly one must own it at any moment.
 *
 * `useChat` reports 'ready' the instant the stream closes, but the rows are
 * still a fetch away. Dropping `liveItems` on that flip leaves NO renderer for
 * the length of the reconcile: the reply blanks out and flashes back in when
 * the rows land. So the overlay must survive the flip.
 *
 * It must also survive the reconcile FETCH resolving, which is a weaker signal
 * than the row existing — a fetch that ran before the backend committed the row
 * comes back empty. The release is therefore gated on the persisted transcript
 * actually carrying an assistant-side row, not on the promise.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

/** A streamed assistant turn, in the shape `mapUiPartsToItems` consumes. */
const ASSISTANT_TURN = [
  {
    role: 'assistant',
    parts: [{ type: 'text', text: 'Hey! What can I help you with today?' }],
  },
];

/** A row as the persisted transcript stores it. */
type PersistedRow = { id: string; type: 'USER' | 'AI' | 'AGENT' | 'SYSTEM' };

const sendMessageSpy = vi.fn();
const stopSpy = vi.fn();
let setChatState: (next: ChatState) => void = () => {};
/** Drives the persisted transcript — i.e. what the poll/reconcile has ingested. */
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

let resolveReconcile: () => void = () => {};

const fakeReconcileAfterStream = vi.fn(
  () =>
    new Promise<void>((resolve) => {
      resolveReconcile = resolve;
    }),
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

// The engine exposes `send` by registering it with MessageCtx (the shared
// `sendMessage` entry point) — drive sends through that seam, like production.
function registeredSend(): (input: SendMessageInput) => Promise<void> | void {
  const handlers = fakeMessageCtx.registerAgentHandlers.mock.calls.at(-1)?.[0];
  if (!handlers) throw new Error('agent handlers were never registered');
  return handlers.send;
}

const fakeWidgetCtx = {
  api: {
    getStreamTransportOptions: () => ({
      api: 'http://test/chat',
      reconnectApi: (id: string) => `http://test/chat/${id}`,
      headers: {},
    }),
    stopStream: vi.fn(async () => {}),
    // Old-backend shape: no turn sources — the release falls back to the
    // plain row swap these specs assert.
    getAgentTurnMessages: vi.fn(async () => null),
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
} as unknown as WidgetCtx;

import { useAgentChat } from '../useAgentChat';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

function Probe() {
  const [rows, setRows] = React.useState<PersistedRow[]>([]);
  setTranscript = setRows;
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config: { token: 't' },
    sessionId: 'sess-1',
    persistedMessages: rows as unknown as WidgetMessageU[],
  });
  return null;
}

describe('useAgentChat post-stream handoff', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
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

  it('keeps the live overlay mounted from the end of the stream until the row lands', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    await act(async () => {
      setTranscript([{ id: 'u1', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    expect(hookValue?.isStreaming).toBe(true);
    expect(hookValue?.liveItems).toHaveLength(1);

    // The stream closes. `isStreaming` goes false immediately — but the row is
    // still in flight, so the overlay must NOT be torn down yet.
    await act(async () => {
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
    });
    expect(hookValue?.isStreaming).toBe(false);
    expect(hookValue?.liveItems).toHaveLength(1);
    expect(hookValue?.liveItems[0]).toEqual({
      kind: 'text',
      text: 'Hey! What can I help you with today?',
    });

    // The reconcile FETCH resolves, but it ran before the backend committed the
    // row — the transcript still ends at the user message. Releasing here is
    // exactly the bug: there would be nothing to hand off to.
    await act(async () => {
      resolveReconcile();
    });
    expect(hookValue?.liveItems).toHaveLength(1);

    // The row lands (this fetch, or a later poll tick) → hand off.
    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'a1', type: 'AI' },
      ]);
    });
    expect(hookValue?.liveItems).toEqual([]);
  });

  it('hands off to a human agent reply, not just an AI one', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    await act(async () => {
      setTranscript([{ id: 'u1', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    await act(async () => {
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
      resolveReconcile();
    });
    expect(hookValue?.liveItems).toHaveLength(1);

    // Handoff sessions settle with an AGENT row. It is just as valid a
    // replacement — without this the overlay would pin a stale AI reply over
    // the human agent's answer.
    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'h1', type: 'AGENT' },
      ]);
    });
    expect(hookValue?.liveItems).toEqual([]);
  });

  it('does not release on a row polled in mid-stream', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    // A poll lands the turn's first narration row while tokens are still
    // arriving. The overlay is still being written to — it must keep the region.
    await act(async () => {
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'a1', type: 'AI' },
      ]);
    });
    expect(hookValue?.liveItems).toHaveLength(1);

    // And it survives the boundary, handing off only after the stream is over.
    await act(async () => {
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
    });
    expect(hookValue?.liveItems).toEqual([]);
  });

  it('holds the overlay through a stopped turn too, not just a completed one', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    await act(async () => {
      setTranscript([{ id: 'u1', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    await act(async () => {
      hookValue?.stop();
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
    });
    // The reconcile waits for the `/stop` ACK (resolved at once here), and
    // the partial reply stays on screen through it.
    expect(fakeReconcileAfterStream).toHaveBeenCalledTimes(1);
    expect(hookValue?.liveItems).toHaveLength(1);
    await act(async () => {
      resolveReconcile();
    });
    // A stopped turn keeps its partial reply on screen while the row loads.
    expect(hookValue?.liveItems).toHaveLength(1);

    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'a1', type: 'AI' },
      ]);
    });
    expect(hookValue?.liveItems).toEqual([]);
  });

  it('holds the overlay through an errored turn', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    await act(async () => {
      setTranscript([{ id: 'u1', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    await act(async () => {
      setChatState({ status: 'error', messages: ASSISTANT_TURN });
      resolveReconcile();
    });
    // Whatever the turn managed to say stays on screen rather than vanishing.
    expect(hookValue?.liveItems).toHaveLength(1);
    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'a1', type: 'AI' },
      ]);
    });
    expect(hookValue?.liveItems).toEqual([]);
  });

  it('does not resurrect the previous turn once the next one is submitted', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    await act(async () => {
      setTranscript([{ id: 'u1', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    await act(async () => {
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
      resolveReconcile();
    });
    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'a1', type: 'AI' },
      ]);
    });
    expect(hookValue?.liveItems).toEqual([]);

    // Next turn: useChat appends the user message, so the last message is no
    // longer an assistant turn — the overlay stays empty and the typing
    // indicator (which keys off `liveItems.length === 0`) shows instead.
    await act(async () => {
      setChatState({
        status: 'submitted',
        messages: [
          ...ASSISTANT_TURN,
          { role: 'user', parts: [{ type: 'text', text: 'again' }] },
        ],
      });
    });
    expect(hookValue?.isStreaming).toBe(true);
    expect(hookValue?.liveItems).toEqual([]);
  });
});
