import type { WidgetConfig } from '@opencx/widget-core';
import type { StreamingStep, StreamingTurnItem } from './agent-chat-stream';

/** Narrow cached or live activity immediately, even before history refreshes. */
export function applyPresentation(
  items: StreamingTurnItem[],
  presentation: WidgetConfig['presentation'],
): StreamingTurnItem[] {
  const projected = items.flatMap<StreamingTurnItem>((item) => {
    if (item.kind !== 'steps') return [item];
    const steps = item.steps.flatMap<StreamingStep>((step) => {
      if (step.kind === 'reasoning') {
        return presentation?.reasoning === false ? [] : [step];
      }
      if (presentation?.toolActivity === 'hidden') return [];
      if (
        presentation?.toolActivity === 'status' &&
        ('input' in step || 'output' in step)
      ) {
        return [{ kind: step.kind, label: step.label, done: step.done }];
      }
      return [step];
    });
    if (steps.length === 0) return [];
    return [
      steps.length === item.steps.length &&
      steps.every((step, index) => step === item.steps[index])
        ? item
        : { ...item, steps },
    ];
  });
  return projected.length === items.length &&
    projected.every((item, index) => item === items[index])
    ? items
    : projected;
}
