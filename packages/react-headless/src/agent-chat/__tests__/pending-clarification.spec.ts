import { describe, expect, it } from 'vitest';
import { pendingClarification } from '../pending-clarification';
import { parseAskQuestionsPayload } from '../ask-questions';
import type { StreamingTurnItem } from '../agent-chat-stream';

function questions(prompt: string): StreamingTurnItem {
  const request = parseAskQuestionsPayload({
    questions: [{ prompt, options: ['a', 'b'] }],
  });
  if (!request) throw new Error('fixture failed to parse');
  return { kind: 'questions', request };
}

const TEXT: StreamingTurnItem = { kind: 'text', text: 'one moment' };

function pending(
  overrides: Partial<Parameters<typeof pendingClarification>[0]> = {},
) {
  return pendingClarification({
    turnSources: [],
    liveItems: [],
    isStreaming: false,
    lastMessageIsFromUser: false,
    ...overrides,
  });
}

describe('pendingClarification', () => {
  it('is nothing when no question was ever asked', () => {
    expect(pending({ turnSources: [{ items: [TEXT] }] })).toBeNull();
  });

  it('surfaces a question from the settled last turn', () => {
    const result = pending({
      turnSources: [{ items: [TEXT, questions('Which order?')] }],
    });
    expect(result?.questions[0]?.prompt).toBe('Which order?');
  });

  it('surfaces a question from the live turn', () => {
    const result = pending({ liveItems: [questions('Which order?')] });
    expect(result?.questions[0]?.prompt).toBe('Which order?');
  });

  it('waits for the stream to settle before offering chips', () => {
    expect(
      pending({ liveItems: [questions('Which order?')], isStreaming: true }),
    ).toBeNull();
  });

  it('is nothing once the customer has spoken since — their reply IS the answer', () => {
    expect(
      pending({
        turnSources: [{ items: [questions('Which order?')] }],
        lastMessageIsFromUser: true,
      }),
    ).toBeNull();
  });

  it('prefers the live turn over a settled one', () => {
    const result = pending({
      turnSources: [{ items: [questions('older')] }],
      liveItems: [questions('newer')],
    });
    expect(result?.questions[0]?.prompt).toBe('newer');
  });

  it('takes the last of several questions asked in one turn', () => {
    const result = pending({
      turnSources: [{ items: [questions('first'), TEXT, questions('second')] }],
    });
    expect(result?.questions[0]?.prompt).toBe('second');
  });

  it('ignores a question from an older turn — a later turn superseded it', () => {
    expect(
      pending({
        turnSources: [{ items: [questions('older')] }, { items: [TEXT] }],
      }),
    ).toBeNull();
  });

  it('offers the newest question when the last turn asked again', () => {
    const result = pending({
      turnSources: [
        { items: [questions('older')] },
        { items: [questions('newer')] },
      ],
    });
    expect(result?.questions[0]?.prompt).toBe('newer');
  });

  it('is nothing for an empty conversation', () => {
    expect(pending()).toBeNull();
  });

  it('does not treat a live turn with no questions as clearing a settled one', () => {
    // The live turn is the newest thing on screen; it asked nothing, so the
    // customer is no longer being asked either.
    expect(
      pending({
        turnSources: [{ items: [questions('older')] }],
        liveItems: [TEXT],
      }),
    ).toBeNull();
  });
});
