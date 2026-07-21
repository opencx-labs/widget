import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart, type UIMessage } from 'ai';

/** One line of a turn's activity trace (reasoning or a tool call). */
export type StreamingStep = {
  kind: 'reasoning' | 'tool';
  /** Reasoning text, or the tool name. */
  label: string;
  done: boolean;
};

/**
 * One entry of a turn, in CHRONOLOGICAL order: an assistant text block, or a
 * run of consecutive activity (reasoning/tools). Order matters — narration text
 * comes BEFORE the tool work it announces.
 */
export type StreamingTurnItem =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; steps: StreamingStep[] };

/** The in-flight v5 turn's render state: active + its ordered items. */
export type StreamingTurnState = {
  active: boolean;
  items: StreamingTurnItem[];
};

/**
 * Flatten a (streaming or complete) useChat assistant message into ordered
 * render items. Parts map IN ORDER; consecutive reasoning/tool parts fold into
 * one steps group at their true timeline position. Pure so the mapping is
 * unit-tested without React or a live stream.
 *
 * (Moved verbatim from the old hand-rolled `MessageCtx.mapStreamSnapshot`; the
 * v5 surface now drives it off useChat's message parts.)
 */
export function mapUiMessageToItems(message: UIMessage): StreamingTurnItem[] {
  const items: StreamingTurnItem[] = [];
  const pushStep = (step: StreamingStep) => {
    const last = items.at(-1);
    if (last?.kind === 'steps') last.steps.push(step);
    else items.push({ kind: 'steps', steps: [step] });
  };
  for (const part of message.parts) {
    if (isTextUIPart(part)) {
      if (part.text.trim().length > 0) {
        items.push({ kind: 'text', text: part.text });
      }
    } else if (isReasoningUIPart(part)) {
      pushStep({
        kind: 'reasoning',
        label: part.text,
        done: part.state !== 'streaming',
      });
    } else if (isToolUIPart(part)) {
      pushStep({
        kind: 'tool',
        label: getToolName(part),
        done: part.state === 'output-available' || part.state === 'output-error',
      });
    }
  }
  return items;
}
