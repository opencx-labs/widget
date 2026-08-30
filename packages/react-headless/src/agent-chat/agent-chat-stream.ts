/** One line of a turn's activity trace (reasoning or a tool call). */
export type StreamingStep = {
  kind: 'reasoning' | 'tool';
  /** Reasoning text, or the tool name. */
  label: string;
  done: boolean;
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
  | { kind: 'spec'; parts: SpecDataPart[] };

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
      });
    } else if (part.type.startsWith('tool-')) {
      pushStep({
        kind: 'tool',
        label: part.type.slice('tool-'.length),
        done: toolDone(part.state),
      });
    }
  }
  return items;
}

/** Flatten a live useChat assistant message through the shared mapper. */
export function mapUiMessageToItems(
  message: UiMessageLike,
): StreamingTurnItem[] {
  return mapUiPartsToItems(message.parts);
}
