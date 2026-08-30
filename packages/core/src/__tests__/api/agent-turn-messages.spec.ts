import { describe, expect, it } from 'vitest';
import { parseAgentTurnMessages } from '../../api/agent-turn-messages';

const PARTS = [
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

describe('parseAgentTurnMessages', () => {
  it('camelCases a valid wire body', () => {
    expect(
      parseAgentTurnMessages({
        turns: [
          { turn_id: 't-1', ui_parts: PARTS, message_uuids: ['r1', 'r2'] },
          { turn_id: 't-2', ui_parts: null, message_uuids: ['r3'] },
        ],
      }),
    ).toEqual({
      turns: [
        { turnId: 't-1', uiParts: PARTS, messageUuids: ['r1', 'r2'] },
        { turnId: 't-2', uiParts: null, messageUuids: ['r3'] },
      ],
    });
  });

  it('rejects every malformed shape with null (never throws, never partial)', () => {
    expect(parseAgentTurnMessages(null)).toBeNull();
    expect(parseAgentTurnMessages('nope')).toBeNull();
    expect(parseAgentTurnMessages({})).toBeNull();
    expect(parseAgentTurnMessages({ turns: 'x' })).toBeNull();
    expect(parseAgentTurnMessages({ turns: [null] })).toBeNull();
    expect(
      parseAgentTurnMessages({ turns: [{ turn_id: 1, message_uuids: [] }] }),
    ).toBeNull();
    expect(
      parseAgentTurnMessages({ turns: [{ turn_id: 't', message_uuids: [1] }] }),
    ).toBeNull();
    expect(
      parseAgentTurnMessages({
        turns: [
          { turn_id: 't', ui_parts: [{ notype: true }], message_uuids: [] },
        ],
      }),
    ).toBeNull();
  });

  it('accepts an empty transcript', () => {
    expect(parseAgentTurnMessages({ turns: [] })).toEqual({ turns: [] });
  });
});
