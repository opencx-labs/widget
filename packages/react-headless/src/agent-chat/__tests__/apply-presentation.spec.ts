import { describe, expect, it } from 'vitest';
import type { StreamingTurnItem } from '../agent-chat-stream';
import { applyPresentation } from '../apply-presentation';

const items: StreamingTurnItem[] = [
  { kind: 'text', text: 'Your answer' },
  {
    kind: 'steps',
    steps: [
      { kind: 'reasoning', label: 'private reasoning', done: true },
      {
        kind: 'tool',
        label: 'lookup',
        done: false,
        input: { secret: 'input-canary' },
        output: { secret: 'output-canary' },
      },
    ],
  },
  { kind: 'spec', parts: [{ type: 'data-spec', data: { root: 'card' } }] },
];

describe('activity presentation', () => {
  it('keeps tool status without input, output, or reasoning and preserves content', () => {
    expect(
      applyPresentation(items, { toolActivity: 'status', reasoning: false }),
    ).toEqual([
      items[0],
      {
        kind: 'steps',
        steps: [{ kind: 'tool', label: 'lookup', done: false }],
      },
      items[2],
    ]);
    expect(JSON.stringify(items)).toContain('input-canary');
    expect(JSON.stringify(items)).toContain('output-canary');
  });

  it('removes hidden activity groups while preserving answers and rich replies', () => {
    expect(
      applyPresentation(items, { toolActivity: 'hidden', reasoning: false }),
    ).toEqual([items[0], items[2]]);
  });

  it('controls reasoning independently of tools', () => {
    expect(
      applyPresentation(items, { toolActivity: 'hidden', reasoning: true }),
    ).toEqual([
      items[0],
      {
        kind: 'steps',
        steps: [{ kind: 'reasoning', label: 'private reasoning', done: true }],
      },
      items[2],
    ]);
  });

  it('does not invent details missing from a server projection or mutate cached data', () => {
    const status = applyPresentation(items, {
      toolActivity: 'status',
      reasoning: false,
    });
    expect(
      applyPresentation(status, { toolActivity: 'details', reasoning: true }),
    ).toBe(status);
    expect(
      applyPresentation(items, { toolActivity: 'details', reasoning: true }),
    ).toBe(items);
    expect(applyPresentation(items, undefined)).toBe(items);
  });
});
