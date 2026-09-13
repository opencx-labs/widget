import { describe, expect, it } from 'vitest';
import type { StreamingTurnItem } from '../agent-chat-stream';
import { sessionPlan } from '../session-plan';

const pending: StreamingTurnItem = {
  kind: 'plan',
  plan: [{ step: 'Review balance', status: 'pending' }],
};
const completed: StreamingTurnItem = {
  kind: 'plan',
  plan: [{ step: 'Balance reviewed', status: 'completed' }],
};
const answer: StreamingTurnItem = { kind: 'text', text: 'Done.' };

describe('sessionPlan', () => {
  it('uses the latest live update over every saved plan', () => {
    expect(
      sessionPlan({
        liveItems: [pending, completed, answer],
        turnSources: [{ items: [pending] }],
      }),
    ).toEqual(completed.plan);
  });

  it('restores the latest saved plan even after turns without plan updates', () => {
    expect(
      sessionPlan({
        liveItems: [answer],
        turnSources: [
          { items: [pending] },
          { items: [completed] },
          { items: [answer] },
        ],
      }),
    ).toEqual(completed.plan);
  });

  it('keeps the same plan when a live turn becomes a saved turn', () => {
    const live = sessionPlan({
      liveItems: [completed],
      turnSources: [{ items: [pending] }],
    });
    const saved = sessionPlan({
      liveItems: [],
      turnSources: [{ items: [pending] }, { items: [completed] }],
    });
    expect(saved).toBe(live);
  });

  it.each([true, false])('respects an explicit empty plan, live=%s', (live) => {
    const cleared: StreamingTurnItem = { kind: 'plan', plan: [] };
    expect(
      sessionPlan({
        liveItems: live ? [cleared] : [],
        turnSources: live
          ? [{ items: [pending] }]
          : [{ items: [pending] }, { items: [cleared] }],
      }),
    ).toEqual([]);
  });

  it('has no plan for an empty session', () => {
    expect(sessionPlan({ liveItems: [], turnSources: [] })).toBeUndefined();
  });
});
