import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart, type UIMessage } from 'ai';

/** One line of a turn's activity trace (reasoning or a tool call). */
export type StreamingStep = {
  kind: 'reasoning' | 'tool';
  /** Reasoning text, or the tool name. */
  label: string;
  done: boolean;
};

/**
 * The wire type `pipeJsonRender` (server-side) gives the ` ```spec ` fenced
 * JSONL patches it drains out of the model's text: typed `data-spec` UIMessage
 * parts. The react layer assembles these into a renderable element-tree spec
 * (`buildSpecFromParts`); core only carries them through untouched so it never
 * depends on `@json-render/*`.
 */
export const SPEC_DATA_PART_TYPE = 'data-spec';

export type SpecDataPart = { type: typeof SPEC_DATA_PART_TYPE; data: unknown };

/**
 * One entry of a turn, in CHRONOLOGICAL order: an assistant text block, a run
 * of consecutive activity (reasoning/tools), or the turn's streamed UI spec
 * patches. Order matters — narration text comes BEFORE the tool work it
 * announces, and the spec renders where the model emitted it.
 */
export type StreamingTurnItem =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; steps: StreamingStep[] }
  | { kind: 'spec'; parts: SpecDataPart[] };

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
  // All of a message's `data-spec` parts are patches to ONE accumulating spec,
  // so they fold into a single 'spec' item anchored where the first patch
  // appeared — later patches grow that item in place instead of spawning a new
  // render position mid-stream.
  let specItem: { kind: 'spec'; parts: SpecDataPart[] } | null = null;
  for (const part of message.parts) {
    if (part.type === SPEC_DATA_PART_TYPE) {
      if (!specItem) {
        specItem = { kind: 'spec', parts: [] };
        items.push(specItem);
      }
      specItem.parts.push({ type: SPEC_DATA_PART_TYPE, data: 'data' in part ? part.data : undefined });
    } else if (isTextUIPart(part)) {
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
