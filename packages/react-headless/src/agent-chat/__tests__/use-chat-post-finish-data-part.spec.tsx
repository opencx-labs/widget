import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contract test against the REAL AI SDK: the v5 backend emits the terminal
 * `data-turn-settled` part AFTER the `finish` chunk (the turn's rows are only
 * persisted once generation ends), and the whole retention design assumes
 * `useChat` still applies it to the finished message's parts. If an SDK bump
 * starts dropping post-`finish` chunks, this fails loudly — the widget would
 * silently lose retention (flash comes back) with no other signal.
 */

function sseBody(chunks: Array<Record<string, unknown>>): string {
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
}

const STREAM_CHUNKS: Array<Record<string, unknown>> = [
  { type: 'start' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'hello' },
  { type: 'text-end', id: 't1' },
  { type: 'finish' },
  // Emitted by the backend AFTER persistence — post-finish by design.
  { type: 'data-turn-settled', data: { turn_id: 'T1', message_uuids: ['r1'] } },
];

let hookValue: ReturnType<typeof useChat> | null = null;

function Probe() {
  hookValue = useChat({
    transport: new DefaultChatTransport({ api: 'http://test/chat' }),
    // The PRODUCTION config — the throttle only wraps the messages callback
    // while `status` is a separate store field, so this spec must prove the
    // finished message (with the post-finish data part) is still observable
    // once status reads 'ready' under throttling.
    throttle: 50,
  });
  return null;
}

describe('useChat applies data parts arriving after finish', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(sseBody(STREAM_CHUNKS), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
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

  it('the finished assistant message carries the post-finish data-turn-settled part', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await hookValue?.sendMessage({ text: 'hi' });
    });
    await vi.waitFor(() => {
      expect(hookValue?.status).toBe('ready');
    });
    // Under `throttle`, the last messages tick can trail the status flip —
    // wait for the throttled snapshot the boundary logic will actually read.
    await vi.waitFor(() => {
      const last = hookValue?.messages.at(-1);
      expect(
        last?.parts.some((part) => part.type === 'data-turn-settled'),
      ).toBe(true);
    });

    const assistant = hookValue?.messages.at(-1);
    expect(assistant?.role).toBe('assistant');
    const settledPart = assistant?.parts.find(
      (part) => part.type === 'data-turn-settled',
    );
    expect(settledPart).toBeDefined();
    expect(
      settledPart && 'data' in settledPart ? settledPart.data : undefined,
    ).toEqual({
      turn_id: 'T1',
      message_uuids: ['r1'],
    });
    // The text survived alongside it.
    expect(assistant?.parts.some((part) => part.type === 'text')).toBe(true);
  });
});
