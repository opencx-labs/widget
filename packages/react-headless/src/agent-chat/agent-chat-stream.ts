import { isAgentStreamKeepalive } from '@opencx/widget-core';
import {
  isAskQuestionsToolName,
  parseAskQuestionsPayload,
  type AskQuestionsRequest,
} from './ask-questions';

/** One line of a turn's activity trace (reasoning or a tool call). */
export type StreamingStep = {
  kind: 'reasoning' | 'tool';
  /** Reasoning text, or the tool name. */
  label: string;
  done: boolean;
  /**
   * Tool steps only: the call's arguments and its result, carried straight
   * off the part. Rendered only where the embedder opted in
   * (`showStepToolIO`); every other surface reads the label alone, so this
   * costs nothing but a reference.
   */
  input?: unknown;
  output?: unknown;
};

/**
 * The wire type `pipeJsonRender` gives the ` ```spec ` fenced JSONL patches it
 * drains out of model text as typed `data-spec` UIMessage parts. The styled
 * renderer assembles these into a renderable element-tree spec.
 */
const SPEC_DATA_PART_TYPE = 'data-spec';

export type SpecDataPart = { type: typeof SPEC_DATA_PART_TYPE; data: unknown };

/** One chronological render entry in an agent turn. */
export type StreamingTurnItem =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; steps: StreamingStep[] }
  | { kind: 'spec'; parts: SpecDataPart[] }
  /**
   * A clarification the agent asked. Never rendered in the transcript: the
   * NEWEST one still pending takes the composer's place instead
   * (`pendingClarification`), and an answered one leaves no card behind.
   */
  | { kind: 'questions'; request: AskQuestionsRequest };

/** The in-flight turn's render state: active + its ordered items. */
export type StreamingTurnState = {
  active: boolean;
  items: StreamingTurnItem[];
};

/**
 * The structural surface read from live AI SDK parts and persisted `ui_parts`,
 * keeping both paths behind one mapper so they cannot drift.
 */
type UiPartLike = {
  type: string;
  text?: unknown;
  state?: unknown;
  data?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
  input?: unknown;
  output?: unknown;
  [key: string]: unknown;
};

/** The message surface consumed by the item mapper. */
export type UiMessageLike = {
  parts: ReadonlyArray<UiPartLike>;
};

/** Flatten UIMessage parts into chronological render items. */
export function mapUiPartsToItems(
  parts: ReadonlyArray<UiPartLike>,
): StreamingTurnItem[] {
  const items: StreamingTurnItem[] = [];
  const pushStep = (step: StreamingStep) => {
    const last = items.at(-1);
    if (last?.kind === 'steps') last.steps.push(step);
    else items.push({ kind: 'steps', steps: [step] });
  };
  const toolDone = (state: unknown) =>
    state === 'output-available' || state === 'output-error';
  // All `data-spec` parts patch one accumulating spec, anchored where the
  // first patch appeared rather than creating a new render position per patch.
  let specItem: { kind: 'spec'; parts: SpecDataPart[] } | null = null;
  for (const part of parts) {
    // The idle heartbeat is `transient` — the SDK never adds it to a message
    // — but a persisted `ui_parts` snapshot replayed on reload can carry one;
    // it renders nothing either way.
    if (isAgentStreamKeepalive(part)) continue;
    if (isAskQuestionsPart(part)) {
      // The raw call NEVER renders, parseable or not — the customer must never
      // be shown `ask_questions` as machinery. A payload that has not finished
      // streaming, or that cannot be read, contributes nothing and the turn's
      // own text carries the moment.
      const questions = askQuestionsItem(part);
      if (questions) items.push(questions);
      continue;
    }
    if (part.type === SPEC_DATA_PART_TYPE) {
      if (!specItem) {
        specItem = { kind: 'spec', parts: [] };
        items.push(specItem);
      }
      specItem.parts.push({ type: SPEC_DATA_PART_TYPE, data: part.data });
    } else if (part.type === 'text') {
      const text = typeof part.text === 'string' ? part.text : '';
      if (text.trim().length > 0) items.push({ kind: 'text', text });
    } else if (part.type === 'reasoning') {
      pushStep({
        kind: 'reasoning',
        label: typeof part.text === 'string' ? part.text : '',
        done: part.state !== 'streaming',
      });
    } else if (part.type === 'dynamic-tool') {
      pushStep({
        kind: 'tool',
        label: typeof part.toolName === 'string' ? part.toolName : 'tool',
        done: toolDone(part.state),
        ...toolIO(part),
      });
    } else if (part.type.startsWith('tool-')) {
      pushStep({
        kind: 'tool',
        label: part.type.slice('tool-'.length),
        done: toolDone(part.state),
        ...toolIO(part),
      });
    }
  }
  return items;
}

/** The tool this part calls, whichever of the two part shapes it uses. */
function partToolName(part: UiPartLike): string | undefined {
  if (part.type === 'dynamic-tool') {
    return typeof part.toolName === 'string' ? part.toolName : undefined;
  }
  return part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : undefined;
}

function isAskQuestionsPart(part: UiPartLike): boolean {
  return isAskQuestionsToolName(partToolName(part));
}

/**
 * An `ask_questions` tool part as a renderable questionnaire, or `null` when
 * the part is not one — or carries nothing parseable yet, which is the normal
 * state while the model is still streaming the call's arguments. Returning
 * `null` there leaves the part to the step mapper, so a half-arrived call
 * shows as ordinary activity rather than flickering an empty questionnaire.
 *
 * The OUTPUT is preferred over the INPUT: when an MCP server answered, its
 * response carries the real `request_id` and option ids.
 */
function askQuestionsItem(
  part: UiPartLike,
): Extract<StreamingTurnItem, { kind: 'questions' }> | null {
  const fallbackRequestId =
    typeof part.toolCallId === 'string' ? part.toolCallId : undefined;
  const request =
    parseAskQuestionsPayload(part.output, fallbackRequestId) ??
    parseAskQuestionsPayload(part.input, fallbackRequestId);
  if (!request) return null;
  return { kind: 'questions', request };
}

/**
 * A tool part's arguments/result, present only when the part actually carries
 * them: absent keys stay absent so a step never claims an empty call had
 * `undefined` input.
 */
function toolIO(part: UiPartLike): { input?: unknown; output?: unknown } {
  return {
    ...(part.input === undefined ? {} : { input: part.input }),
    ...(part.output === undefined ? {} : { output: part.output }),
  };
}
