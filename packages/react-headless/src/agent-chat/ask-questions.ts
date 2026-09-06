import { z } from 'zod';

/**
 * The `ask_questions` clarification payload.
 *
 * When the agent needs to narrow a request before acting it calls this tool
 * instead of writing a paragraph of questions. Rendering that call as an
 * ordinary tool step would show the customer raw JSON, so the stream mapper
 * lifts it out of the activity trace and the styled layer renders the QUESTION
 * — the same trade the companion has always made.
 *
 * The payload arrives in two shapes and both are accepted:
 *
 *  1. as the tool's INPUT — the model emits the questions in the tool-call
 *     chunk and the step finishes without a result, because the customer's
 *     reply IS the result, fed back as the next user message;
 *  2. as the tool's OUTPUT — an MCP server answers with a structured response
 *     carrying `request_id` and per-option `{ id, label }`.
 *
 * The loose model-emitted shape is normalised into the strict rendered shape,
 * so selection state can key off stable ids no matter which shape arrived.
 */

export type AskQuestionsRequest = {
  request_id: string;
  questions: Array<{
    id: string;
    prompt: string;
    selection: 'single' | 'multiple';
    /**
     * Chips to pick from. May be empty once the "I'll type it" restatements
     * are dropped — the questionnaire then offers the free-text answer alone.
     */
    options: Array<{ id: string; label: string }>;
  }>;
};

const looseOptionSchema = z.union([
  z.string(),
  z.looseObject({ id: z.string().optional(), label: z.string() }),
]);

const looseQuestionSchema = z.looseObject({
  id: z.string().optional(),
  prompt: z.string(),
  selection: z.enum(['single', 'multiple']).default('single'),
  options: z.array(looseOptionSchema).min(1),
});

const looseAskQuestionsSchema = z.looseObject({
  request_id: z.string().optional(),
  questions: z.array(looseQuestionSchema).min(1),
});

/** Matches the bare name and any MCP-prefixed form (`mcp__opencx__ask_questions`). */
export function isAskQuestionsToolName(toolName: string | undefined): boolean {
  return Boolean(toolName?.includes('ask_questions'));
}

/**
 * Chips that merely restate the "I'll type it" affordance the questionnaire
 * always renders. The first two catch verb-form variants; the third is
 * anchored so a bare "Other" is dropped while "Other reason" survives.
 */
const REDUNDANT_OPTION_PATTERNS = [
  /\bi[’'ʼ‘]?ll\s+(type|describe|enter|write|tell)\b/i,
  /\b(type|describe|enter|write|tell)\s+(it|my\s+own|manually)\b/i,
  /^\s*(other|custom|none\s+of\s+the\s+above|something\s+else)\s*\.?\s*$/i,
];

function isRedundantManualOption(label: string): boolean {
  return REDUNDANT_OPTION_PATTERNS.some((pattern) => pattern.test(label));
}

function normalize(
  loose: z.infer<typeof looseAskQuestionsSchema>,
  fallbackRequestId?: string,
): AskQuestionsRequest {
  return {
    request_id: loose.request_id ?? fallbackRequestId ?? 'req-clarification',
    questions: loose.questions.map((question, questionIndex) => ({
      id: question.id ?? `q${questionIndex}`,
      prompt: question.prompt,
      selection: question.selection,
      options: question.options
        .map((option, optionIndex) =>
          typeof option === 'string'
            ? { id: `q${questionIndex}-o${optionIndex}`, label: option }
            : {
                id: option.id ?? `q${questionIndex}-o${optionIndex}`,
                label: option.label,
              },
        )
        .filter((option) => !isRedundantManualOption(option.label)),
    })),
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * The AI SDK surfaces a tool payload as a parsed object, a JSON string, an MCP
 * content array (`[{ type: 'text', text }]`), or a single content block.
 */
function unwrapPayload(payload: unknown): unknown {
  if (payload == null) return null;
  if (typeof payload === 'string') return safeJsonParse(payload);
  if (Array.isArray(payload)) {
    for (const block of payload) {
      if (block && typeof block === 'object' && 'text' in block) {
        const text: unknown = (block as { text: unknown }).text;
        if (typeof text === 'string') return safeJsonParse(text);
      }
    }
    return null;
  }
  if (typeof payload === 'object') {
    if ('text' in payload) {
      const maybeText: unknown = (payload as { text: unknown }).text;
      if (typeof maybeText === 'string') return safeJsonParse(maybeText);
    }
    return payload;
  }
  return null;
}

/**
 * Parses a clarification request from a tool part's output or input. Returns
 * `null` on anything unrecognised — a malformed payload must fall back to the
 * ordinary step rendering, never blank the turn or throw inside the stream.
 */
export function parseAskQuestionsPayload(
  payload: unknown,
  fallbackRequestId?: string,
): AskQuestionsRequest | null {
  const candidate = unwrapPayload(payload);
  if (candidate == null) return null;
  const parsed = looseAskQuestionsSchema.safeParse(candidate);
  return parsed.success ? normalize(parsed.data, fallbackRequestId) : null;
}

/**
 * The single combined message sent back when the customer submits. One
 * `Q:`/`A:` block per answered question keeps the mapping explicit for the
 * agent reading it as an ordinary user turn.
 */
export function formatAskQuestionsAnswers(
  request: AskQuestionsRequest,
  answersByQuestionId: ReadonlyMap<string, string>,
): string {
  const blocks: string[] = [];
  for (const question of request.questions) {
    const answer = answersByQuestionId.get(question.id);
    if (answer === undefined || answer.trim() === '') continue;
    blocks.push(`Q: ${question.prompt}\nA: ${answer.trim()}`);
  }
  return blocks.join('\n\n');
}
