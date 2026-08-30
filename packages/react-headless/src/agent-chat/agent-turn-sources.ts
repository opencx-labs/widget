import type { AgentTurnMessages } from '@opencx/widget-core';
import { mapUiPartsToItems, type StreamingTurnItem } from './agent-chat-stream';

/** Internal fallback used before a live turn receives a message-derived key. */
export const LIVE_TURN_FALLBACK_KEY = 'turn-live';

/** One settled turn's transcript coverage and styled render model. */
export type TurnRenderSource = {
  key: string;
  turnId: string;
  rowIds: string[];
  items: StreamingTurnItem[];
};

/** Fold a fresh history fetch into the current list of turn render sources. */
export function mergeTurnSources({
  existing,
  fetched,
}: {
  existing: TurnRenderSource[];
  fetched: AgentTurnMessages;
}): TurnRenderSource[] {
  const existingByTurnId = new Map(
    existing.map((source) => [source.turnId, source] as const),
  );
  const fetchedTurnIds = new Set<string>();
  const merged: TurnRenderSource[] = [];
  for (const turn of fetched.turns) {
    fetchedTurnIds.add(turn.turnId);
    if (turn.messageUuids.length === 0) continue;
    const kept = existingByTurnId.get(turn.turnId);
    if (kept) {
      // Preserve React identity and the exact streamed items; only the server's
      // authoritative transcript row coverage may change.
      if (sameRowIds(kept.rowIds, turn.messageUuids)) {
        merged.push(kept);
      } else {
        merged.push({ ...kept, rowIds: turn.messageUuids });
      }
      continue;
    }
    if (turn.uiParts !== null) {
      const items = mapUiPartsToItems(turn.uiParts);
      if (items.length === 0) continue;
      merged.push({
        key: `turn-${turn.turnId}`,
        turnId: turn.turnId,
        rowIds: turn.messageUuids,
        items,
      });
    }
  }
  // Preserve a live-retained turn that settled while this snapshot was in
  // flight and therefore was not yet present in the response.
  for (const source of existing) {
    if (!fetchedTurnIds.has(source.turnId)) merged.push(source);
  }

  const unchanged =
    merged.length === existing.length &&
    merged.every((source, index) => source === existing[index]);
  return unchanged ? existing : merged;
}

const sameRowIds = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** Read the terminal turn identity emitted on a finished useChat message. */
export function parseTurnSettledPart(
  parts: ReadonlyArray<{ type: string; data?: unknown }>,
): { turnId: string; rowIds: string[] } | null {
  for (const part of parts) {
    if (part.type !== 'data-turn-settled') continue;
    const data = part.data;
    if (!isRecord(data)) return null;
    if (
      typeof data.turn_id !== 'string' ||
      !isStringArray(data.message_uuids)
    ) {
      return null;
    }
    return { turnId: data.turn_id, rowIds: data.message_uuids };
  }
  return null;
}
