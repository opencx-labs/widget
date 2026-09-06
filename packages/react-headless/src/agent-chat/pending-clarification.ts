import type { StreamingTurnItem } from './agent-chat-stream';
import type { AskQuestionsRequest } from './ask-questions';
import type { TurnRenderSource } from './agent-turn-sources';

/**
 * The clarification the agent is currently WAITING on, or `null`.
 *
 * A pending clarification replaces the composer, so this answers "should the
 * customer be picking an option instead of typing?" — not merely "was a
 * question asked at some point". Three rules decide it, and each one exists
 * because of how the answer is delivered (as an ordinary user message):
 *
 *  - Nothing while the turn is still streaming. The agent may yet ask again,
 *    and chips rendered mid-stream look clickable while the answer they would
 *    send is about to be superseded.
 *  - The NEWEST questionnaire wins — the live turn's over any settled turn's,
 *    and the last of several within one turn.
 *  - Nothing once the customer has spoken since. Their reply IS the answer, so
 *    a questionnaire still on screen after it would collect a second one.
 */
export function pendingClarification({
  turnSources,
  liveItems,
  isStreaming,
  lastMessageIsFromUser,
}: {
  turnSources: ReadonlyArray<Pick<TurnRenderSource, 'items'>>;
  liveItems: ReadonlyArray<StreamingTurnItem>;
  isStreaming: boolean;
  /** The transcript's last row is the customer's — they have already answered. */
  lastMessageIsFromUser: boolean;
}): AskQuestionsRequest | null {
  if (isStreaming || lastMessageIsFromUser) return null;

  // Only the NEWEST turn can hold a pending question. Once a later turn
  // exists — settled or in flight — the earlier questionnaire was answered or
  // abandoned, and leaving it in the composer would collect an answer to a
  // question the conversation has moved past.
  const newest = liveItems.length > 0 ? liveItems : turnSources.at(-1)?.items;
  return newest ? lastQuestions(newest) : null;
}

function lastQuestions(
  items: ReadonlyArray<StreamingTurnItem>,
): AskQuestionsRequest | null {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item?.kind === 'questions') return item.request;
  }
  return null;
}
