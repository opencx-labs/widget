import {
  PrimitiveState,
  type SendMessageInput,
  type StagedUserTurn,
  type WidgetCtx,
  type WidgetUserMessage,
} from '@opencx/widget-core';
import React, { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Against the REAL AI SDK (every other engine spec mocks `useChat`, which
 * removes its automatic resume): the first send of a fresh conversation
 * creates the session, so the chat's id and `resume` both change mid-send.
 * The turn must still be observed end to end — in flight while it streams,
 * and its rows reconciled right after it ends. A workflow can answer that
 * first message with no reply at all (it posts a message with options
 * instead); only that reconcile brings the workflow's message in, otherwise
 * the visitor waits for the next session poll.
 */

const SESSION_ID = 'sess-1';

function sseBody(chunks: Array<Record<string, unknown>>): string {
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`).join('\n\n')}${chunks.length > 0 ? '\n\n' : ''}data: [DONE]\n\n`;
}

const SILENT_TURN: Array<Record<string, unknown>> = [
  { type: 'start' },
  { type: 'finish' },
];
const AI_REPLY_TURN: Array<Record<string, unknown>> = [
  { type: 'start' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'Happy to help.' },
  { type: 'text-end', id: 't1' },
  { type: 'finish' },
  { type: 'data-turn-settled', data: { turn_id: 'T1', message_uuids: ['r1'] } },
];

/** Ends the open POST stream with these chunks. */
let endTurn: (chunks: Array<Record<string, unknown>>) => void = () => {};
const requests: string[] = [];

const streamingFetch: typeof fetch = async (input, init) => {
  const method = init?.method ?? 'GET';
  requests.push(`${method} ${String(input)}`);
  if (method === 'GET') {
    // The resume probe: the network answers after the send has started, and
    // no turn is live for the session at the moment it was asked.
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(null, { status: 204 });
  }
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        endTurn = (chunks) => {
          controller.enqueue(encoder.encode(sseBody(chunks)));
          controller.close();
        };
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
};

/** The session store, as `SessionCtx` holds it: the first send creates it. */
const session = new PrimitiveState<{ id: string | null }>({ id: null });

function buildUserMessage(content: string): WidgetUserMessage {
  return {
    id: `msg-${content}`,
    type: 'USER',
    deliveredAt: null,
    content,
    timestamp: new Date().toISOString(),
    pending: true,
  };
}

const fakeReconcileAfterStream = vi.fn(async (_sessionId: string) => {});

const fakeMessageCtx = {
  stageUserTurn: vi.fn(
    async (input: SendMessageInput): Promise<StagedUserTurn | null> => {
      // `ensureSessionId`: create the session when none exists yet.
      await Promise.resolve();
      if (session.get().id === null) session.setPartial({ id: SESSION_ID });
      return {
        sessionId: SESSION_ID,
        userMessage: buildUserMessage(input.content),
        initialMessages: [],
      };
    },
  ),
  buildQueuedUserMessage: vi.fn((input: SendMessageInput) => ({
    sessionId: SESSION_ID,
    userMessage: buildUserMessage(input.content),
  })),
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessageDelivered: vi.fn(),
  notifySendAccepted: vi.fn(),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
  state: { setPartial: vi.fn() },
};

function registeredSend(): (input: SendMessageInput) => Promise<void> | void {
  const handlers = fakeMessageCtx.registerAgentHandlers.mock.calls.at(-1)?.[0];
  if (!handlers) throw new Error('agent handlers were never registered');
  return handlers.send;
}

const fakeWidgetCtx = {
  agent: {},
  api: {
    getStreamTransportOptions: () => ({
      api: 'http://test/chat',
      reconnectApi: (id: string) => `http://test/chat/${id}`,
      headers: {},
    }),
    stopStream: vi.fn(async () => {}),
    getAgentTurnMessages: vi.fn(async () => null),
  },
  messageCtx: fakeMessageCtx,
  reconcileAfterStream: fakeReconcileAfterStream,
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
  const { id } = useSyncExternalStore(session.subscribe, session.get);
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config: { token: 't', streamingFetch },
    sessionId: id,
    persistedMessages: [],
  });
  return null;
}

/** Let the network (the delayed probe) and React settle. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe('useAgentChat first send of a fresh conversation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    requests.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each([
    {
      send: 'first',
      existingSession: null,
      turn: 'silent',
      chunks: SILENT_TURN,
    },
    {
      send: 'first',
      existingSession: null,
      turn: 'AI reply',
      chunks: AI_REPLY_TURN,
    },
    // Positive control: a session that already exists when the visitor sends.
    {
      send: 'later',
      existingSession: SESSION_ID,
      turn: 'silent',
      chunks: SILENT_TURN,
    },
    {
      send: 'later',
      existingSession: SESSION_ID,
      turn: 'AI reply',
      chunks: AI_REPLY_TURN,
    },
  ])(
    '$send send, $turn turn: in flight until the stream ends, then its rows are reconciled',
    async ({ existingSession, chunks }) => {
      session.setPartial({ id: existingSession });
      await act(async () => root.render(<Probe />));
      await settle();

      await act(async () => {
        await registeredSend()({ content: 'I have a security incident' });
      });
      await settle();

      expect(requests.filter((r) => r.startsWith('POST'))).toHaveLength(1);
      // The visitor sees the reply being awaited, and nothing reconciles a
      // turn that has not ended.
      expect(hookValue?.isStreaming).toBe(true);
      expect(fakeReconcileAfterStream).not.toHaveBeenCalled();

      await act(async () => endTurn(chunks));
      await vi.waitFor(() =>
        expect(fakeReconcileAfterStream).toHaveBeenCalledWith(SESSION_ID),
      );
      expect(fakeReconcileAfterStream).toHaveBeenCalledOnce();
      expect(hookValue?.isStreaming).toBe(false);
    },
  );

  it('a session that appears without a send (restored, picked) still probes for a live turn', async () => {
    session.setPartial({ id: null });
    await act(async () => root.render(<Probe />));
    await settle();
    expect(requests).toEqual([]);

    await act(async () => session.setPartial({ id: SESSION_ID }));
    await settle();

    expect(requests).toEqual([`GET http://test/chat/${SESSION_ID}`]);
  });
});
