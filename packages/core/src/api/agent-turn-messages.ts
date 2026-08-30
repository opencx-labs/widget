type AgentTurnUiPart = { type: string } & Record<string, unknown>;

/**
 * The v5 messages endpoint's payload, camelCased at the wire seam: every
 * settled agent turn with its final UIMessage parts and transcript row ids.
 */
export type AgentTurnMessages = {
  turns: Array<{
    turnId: string;
    uiParts: AgentTurnUiPart[] | null;
    messageUuids: string[];
  }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isAgentTurnUiPart = (value: unknown): value is AgentTurnUiPart =>
  isRecord(value) && typeof value.type === 'string';

/**
 * Validate and camelCase the endpoint response. Returns null on any shape
 * surprise so callers can preserve the pre-feature plain-row rendering.
 */
export function parseAgentTurnMessages(
  body: unknown,
): AgentTurnMessages | null {
  if (!isRecord(body) || !Array.isArray(body.turns)) return null;
  const turns: AgentTurnMessages['turns'] = [];
  for (const entry of body.turns) {
    if (!isRecord(entry)) return null;
    const turnId = entry.turn_id;
    if (typeof turnId !== 'string') return null;
    if (!isStringArray(entry.message_uuids)) return null;
    const rawParts = entry.ui_parts;
    let uiParts: AgentTurnUiPart[] | null = null;
    if (rawParts !== null && rawParts !== undefined) {
      if (!Array.isArray(rawParts) || !rawParts.every(isAgentTurnUiPart)) {
        return null;
      }
      uiParts = rawParts;
    }
    turns.push({ turnId, uiParts, messageUuids: entry.message_uuids });
  }
  return { turns };
}
