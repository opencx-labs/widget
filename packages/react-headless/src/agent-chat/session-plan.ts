import type { StreamingTurnItem } from './agent-chat-stream';
import type { TurnRenderSource } from './agent-turn-sources';

/** The latest plan snapshot belongs to the session, even when later turns have no plan update. */
export function sessionPlan({
  liveItems,
  turnSources,
}: {
  liveItems: readonly StreamingTurnItem[];
  turnSources: ReadonlyArray<Pick<TurnRenderSource, 'items'>>;
}): Extract<StreamingTurnItem, { kind: 'plan' }>['plan'] | undefined {
  const livePlan = liveItems.findLast((item) => item.kind === 'plan');
  if (livePlan) return livePlan.plan;

  for (let index = turnSources.length - 1; index >= 0; index--) {
    const plan = turnSources[index]?.items.findLast(
      (item) => item.kind === 'plan',
    );
    // An empty snapshot explicitly clears the plan; do not revive an older one.
    if (plan) return plan.plan;
  }
  return undefined;
}
