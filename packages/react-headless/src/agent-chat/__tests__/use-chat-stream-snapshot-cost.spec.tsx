import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contract test against the REAL AI SDK: a streamed delta must not deep-copy
 * the parts that already finished. `@ai-sdk/react` 4.0.34 snapshotted the
 * store with `structuredClone(message)` on every delta, so the work per update
 * grew with the reply; on React Native a long reply piled up enough updates to
 * hit React's limit ("Maximum update depth exceeded", Oct 2026).
 * 4.0.67 copies shallowly, which keeps a finished part's nested data the same
 * object from one snapshot to the next. If a bump brings the deep copy back,
 * this fails loudly instead of resurfacing as a crash on a customer's device.
 */

const TOOL_OUTPUT = { hits: [{ id: 1, title: 'Refund policy' }] };
const TEXT = 'Refunds are processed within five business days after approval.';

function sseStream(
  chunks: Array<Record<string, unknown>>,
  gapMs: number,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
        await new Promise((resolve) => setTimeout(resolve, gapMs));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

const STREAM_CHUNKS: Array<Record<string, unknown>> = [
  { type: 'start' },
  { type: 'tool-input-start', toolCallId: 'c1', toolName: 'kb_search' },
  {
    type: 'tool-input-available',
    toolCallId: 'c1',
    toolName: 'kb_search',
    input: { query: 'refund' },
  },
  { type: 'tool-output-available', toolCallId: 'c1', output: TOOL_OUTPUT },
  { type: 'text-start', id: 't1' },
  // One character per delta: the shape the server sent before opencx#3879.
  ...TEXT.split('').map((delta) => ({ type: 'text-delta', id: 't1', delta })),
  { type: 'text-end', id: 't1' },
  { type: 'finish' },
];

let hookValue: ReturnType<typeof useChat> | null = null;
const snapshots: UIMessage[][] = [];

function Probe() {
  hookValue = useChat({
    transport: new DefaultChatTransport({ api: 'http://test/chat' }),
    // Production config: the throttle decides how many snapshots React sees.
    throttle: 50,
  });
  const { messages } = hookValue;
  useEffect(() => {
    snapshots.push(messages);
  }, [messages]);
  return null;
}

function toolOutput(messages: UIMessage[]): unknown {
  const assistant = messages.at(-1);
  if (assistant?.role !== 'assistant') return undefined;
  const part = assistant.parts.find(
    (candidate) => candidate.type === 'tool-kb_search',
  );
  return part && 'output' in part ? part.output : undefined;
}

describe('useChat snapshots do not deep-copy finished parts on every delta', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    snapshots.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(sseStream(STREAM_CHUNKS, 15), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps a finished tool part's output the same object across streamed text deltas", async () => {
    await act(async () => root.render(<Probe />));
    // Not awaited inside `act`: an act scope batches every update until it
    // exits, which would hide the streaming snapshots this test is about.
    act(() => {
      void hookValue?.sendMessage({ text: 'refund?' });
    });
    // Leave 'ready' first, so the next wait cannot pass before the turn starts.
    await vi.waitFor(() => expect(hookValue?.status).not.toBe('ready'));
    await vi.waitFor(() => expect(hookValue?.status).toBe('ready'), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => {
        const text = hookValue?.messages
          .at(-1)
          ?.parts.filter((part) => part.type === 'text')
          .map((part) => ('text' in part ? part.text : ''))
          .join('');
        expect(text).toBe(TEXT);
      },
      { timeout: 2_000 },
    );

    // Positive control: React saw several distinct snapshots while the text
    // streamed after the tool part had finished.
    const outputs = snapshots
      .map(toolOutput)
      .filter(
        (output): output is object =>
          typeof output === 'object' && output !== null,
      );
    expect(outputs.length).toBeGreaterThanOrEqual(3);
    expect(new Set(snapshots.filter((s) => toolOutput(s))).size).toBe(
      outputs.length,
    );
    expect(outputs.at(-1)).toEqual(TOOL_OUTPUT);

    // The regression: a deep copy per delta hands React a new `output` object
    // on every snapshot; a shallow copy keeps the finished part's data.
    const distinct = new Set(outputs);
    expect(distinct.size).toBe(1);
  });
});
