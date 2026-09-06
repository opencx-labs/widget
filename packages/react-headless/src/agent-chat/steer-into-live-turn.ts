import { isAgentStreamKeepalive, isTurnSteeredPart } from '@opencx/widget-core';
import type { UIMessageChunk } from 'ai';

/**
 * What the v5 stream endpoint did with a message POSTed while the session
 * already had a live turn. Decided by the FIRST chunk of the request's own
 * stream:
 * - `steered`: the message joined the live turn (`data-turn-steered` is the
 *   only chunk); the live turn's stream — already rendering — answers it.
 * - `turn`: the live turn did not take it, so the backend superseded that
 *   turn and opened a new one for this message on THIS stream. The caller
 *   drops this copy and replays the new turn through the engine's own
 *   stream (the session's resume pointer moved to it).
 * - `failed`: the turn errored before producing anything.
 * - `silent`: the stream ended with no chunk at all — the reply was withheld
 *   (assist draft, handoff); the transcript rows say what happened.
 */
export type SteerOutcome =
  | { kind: 'steered' }
  | { kind: 'turn' }
  | { kind: 'failed'; errorText: string }
  | { kind: 'silent' };

/**
 * Classify a steer attempt from its stream's first DECISIVE chunk, then
 * release the stream. The backend heartbeats (`data-keepalive`) while the
 * request waits to be steered or for a fallback turn's first chunk — those
 * decide nothing and are skipped. Releasing never cancels the server turn
 * (resumable streams treat a client drop as a disconnect), so the `turn`
 * case can be replayed.
 */
export async function readSteerOutcome(
  stream: ReadableStream<UIMessageChunk>,
): Promise<SteerOutcome> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done || value === undefined) return { kind: 'silent' };
      if (isAgentStreamKeepalive(value)) continue;
      if (isTurnSteeredPart(value)) return { kind: 'steered' };
      if (value.type === 'error') {
        return { kind: 'failed', errorText: value.errorText };
      }
      return { kind: 'turn' };
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
