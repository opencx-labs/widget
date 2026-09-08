import type { AgentTurnMessagesDto } from '@opencx/widget-core';
import { describe, expect, it } from 'vitest';
import { mapUiPartsToItems, type UiMessageLike } from '../agent-chat-stream';
import {
  mergeTurnSources,
  parseTurnSettledPart,
  type TurnRenderSource,
} from '../agent-turn-sources';

type PersistedUiParts = NonNullable<
  AgentTurnMessagesDto['turns'][number]['ui_parts']
>;

const PARTS: PersistedUiParts = [
  { type: 'text', text: 'Let me check.', state: 'done' },
  {
    type: 'tool-count_sessions',
    toolCallId: 'c1',
    state: 'output-available',
    input: { scope: 'all' },
    output: { count: 42 },
  },
  { type: 'text', text: 'You have 42 sessions.', state: 'done' },
];

describe('mapUiPartsToItems', () => {
  it('is the single mapper behind live and reload paths', () => {
    const parts: PersistedUiParts = [
      { type: 'reasoning', text: 'hm', state: 'done' },
      ...PARTS,
      { type: 'data-spec', data: { op: 'add' } },
    ];
    const fromServer = mapUiPartsToItems(parts);
    const liveMessage: UiMessageLike = {
      parts: [
        { type: 'reasoning', text: 'hm', state: 'done' },
        { type: 'text', text: 'Let me check.', state: 'done' },
        {
          type: 'tool-count_sessions',
          toolCallId: 'c1',
          state: 'output-available',
          input: { scope: 'all' },
          output: { count: 42 },
        },
        { type: 'text', text: 'You have 42 sessions.', state: 'done' },
        { type: 'data-spec', data: { op: 'add' } },
      ],
    };

    expect(mapUiPartsToItems(liveMessage.parts)).toEqual(fromServer);
    expect(fromServer).toEqual([
      {
        kind: 'steps',
        steps: [{ kind: 'reasoning', label: 'hm', done: true }],
      },
      { kind: 'text', text: 'Let me check.' },
      {
        kind: 'steps',
        steps: [
          {
            kind: 'tool',
            label: 'count_sessions',
            done: true,
            input: { scope: 'all' },
            output: { count: 42 },
          },
        ],
      },
      { kind: 'text', text: 'You have 42 sessions.' },
      { kind: 'spec', parts: [{ type: 'data-spec', data: { op: 'add' } }] },
    ]);
  });

  it('renders dynamic-tool parts using their toolName', () => {
    expect(
      mapUiPartsToItems([
        {
          type: 'dynamic-tool',
          toolName: 'mcp_lookup',
          toolCallId: 'c1',
          state: 'output-available',
        },
        { type: 'dynamic-tool', toolCallId: 'c2', state: 'input-available' },
      ]),
    ).toEqual([
      {
        kind: 'steps',
        steps: [
          { kind: 'tool', label: 'mcp_lookup', done: true },
          { kind: 'tool', label: 'tool', done: false },
        ],
      },
    ]);
  });

  it('skips empty text and tolerates missing activity fields', () => {
    expect(
      mapUiPartsToItems([
        { type: 'text', text: '   ' },
        { type: 'text' },
        { type: 'tool-slow', toolCallId: 'c1', state: 'input-available' },
        { type: 'reasoning' },
      ]),
    ).toEqual([
      {
        kind: 'steps',
        steps: [
          { kind: 'tool', label: 'slow', done: false },
          { kind: 'reasoning', label: '', done: true },
        ],
      },
    ]);
  });
});

describe('mergeTurnSources', () => {
  const fetched: AgentTurnMessagesDto = {
    turns: [
      { turn_id: 't-1', ui_parts: PARTS, message_uuids: ['r1', 'r2'] },
      { turn_id: 't-2', ui_parts: PARTS, message_uuids: ['r3'] },
    ],
  };

  it('builds server sources for parts-bearing turns', () => {
    const merged = mergeTurnSources({ existing: [], fetched });
    expect(merged.map((source) => source.key)).toEqual([
      'turn-t-1',
      'turn-t-2',
    ]);
    expect(merged[0]?.rowIds).toEqual(['r1', 'r2']);
    expect(merged[0]?.items).toEqual(mapUiPartsToItems(PARTS));
  });

  it('keeps retained identity and items while refreshing rows', () => {
    const existing: TurnRenderSource[] = [
      {
        key: 'turn-user-msg-9',
        turnId: 't-1',
        rowIds: ['r1'],
        items: mapUiPartsToItems([
          { type: 'text', text: 'retained copy', state: 'done' },
        ]),
      },
    ];
    const merged = mergeTurnSources({ existing, fetched });
    expect(merged[0]?.key).toBe('turn-user-msg-9');
    expect(merged[0]?.items).toBe(existing[0]?.items);
    expect(merged[0]?.rowIds).toEqual(['r1', 'r2']);
  });

  it('drops rowless turns and leaves partless turns to plain rendering', () => {
    const merged = mergeTurnSources({
      existing: [],
      fetched: {
        turns: [
          { turn_id: 't-a', ui_parts: PARTS, message_uuids: [] },
          { turn_id: 't-b', ui_parts: null, message_uuids: ['r9'] },
          { turn_id: 't-c', ui_parts: PARTS, message_uuids: ['r10'] },
        ],
      },
    });
    expect(merged.map((source) => source.key)).toEqual(['turn-t-c']);
    expect(merged[0]?.items).toEqual(mapUiPartsToItems(PARTS));
  });

  it('replaces changed projections without changing retained turn identity or dropping newer turns', () => {
    const existing: TurnRenderSource[] = [
      {
        key: 'turn-local-user',
        turnId: 't-1',
        rowIds: ['r1'],
        items: mapUiPartsToItems(PARTS),
      },
      {
        key: 'turn-newer',
        turnId: 't-live',
        rowIds: ['r-live'],
        items: [{ kind: 'text', text: 'new reply' }],
      },
    ];
    const merged = mergeTurnSources({
      existing,
      refreshItems: true,
      fetched: {
        turns: [
          {
            turn_id: 't-1',
            message_uuids: ['r1', 'r2'],
            ui_parts: [{ type: 'text', text: 'You have 42 sessions.' }],
          },
        ],
      },
    });
    expect(merged[0]).toEqual({
      key: 'turn-local-user',
      turnId: 't-1',
      rowIds: ['r1', 'r2'],
      items: [{ kind: 'text', text: 'You have 42 sessions.' }],
    });
    expect(merged[1]).toBe(existing[1]);
  });

  it.each([null, []])(
    'falls back to plain rows when a refresh has no renderable parts: %j',
    (ui_parts) => {
      const existing = mergeTurnSources({ existing: [], fetched });
      const merged = mergeTurnSources({
        existing,
        refreshItems: true,
        fetched: {
          turns: [{ turn_id: 't-1', message_uuids: ['r1', 'r2'], ui_parts }],
        },
      });
      expect(merged.map((source) => source.turnId)).toEqual(['t-2']);
    },
  );

  it('returns the existing array identity for a no-op merge', () => {
    const existing = mergeTurnSources({ existing: [], fetched });
    expect(mergeTurnSources({ existing, fetched })).toBe(existing);
  });

  it('preserves a retained turn missing from a stale fetch', () => {
    const existing: TurnRenderSource[] = [
      {
        key: 'turn-live-retained',
        turnId: 't-live',
        rowIds: ['r-live'],
        items: [{ kind: 'text', text: 'finished while fetching' }],
      },
    ];
    expect(mergeTurnSources({ existing, fetched: { turns: [] } })).toEqual(
      existing,
    );
  });
});

describe('parseTurnSettledPart', () => {
  it('extracts terminal turn identity from a finished message', () => {
    expect(
      parseTurnSettledPart([
        { type: 'text' },
        {
          type: 'data-turn-settled',
          data: { turn_id: 'T1', message_uuids: ['r1', 'r2'] },
        },
      ]),
    ).toEqual({ turnId: 'T1', rowIds: ['r1', 'r2'] });
  });

  it('returns null when absent or malformed', () => {
    expect(parseTurnSettledPart([{ type: 'text' }])).toBeNull();
    expect(parseTurnSettledPart([])).toBeNull();
    expect(
      parseTurnSettledPart([{ type: 'data-turn-settled', data: null }]),
    ).toBeNull();
    expect(
      parseTurnSettledPart([
        { type: 'data-turn-settled', data: { turn_id: 1, message_uuids: [] } },
      ]),
    ).toBeNull();
    expect(
      parseTurnSettledPart([
        {
          type: 'data-turn-settled',
          data: { turn_id: 'T1', message_uuids: [1] },
        },
      ]),
    ).toBeNull();
  });
});
