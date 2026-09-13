import type { StreamingTurnItem } from '@opencx/widget-react-headless';
import { Check, Circle, Loader2 } from 'lucide-react';
import React from 'react';

/** The assistant supplies plan state; layout and progress indicators belong to the widget. */
export function TaskPlan({
  plan,
  active,
}: {
  plan: Extract<StreamingTurnItem, { kind: 'plan' }>['plan'];
  active: boolean;
}) {
  const completed = plan.filter((step) => step.status === 'completed').length;
  return (
    <details
      className="rounded-xl border border-primary/10 bg-background"
      data-task-plan
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        <span className="ms-1">
          {completed}/{plan.length} ·{' '}
          {plan.find((step) => step.status === 'in_progress')?.step ??
            plan.find((step) => step.status === 'pending')?.step ??
            plan[0]?.step}
        </span>
      </summary>
      <ol className="max-h-60 overflow-y-auto border-t border-primary/10 px-3 py-2 space-y-2">
        {plan.map((step, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-sm"
            data-plan-status={step.status}
          >
            {step.status === 'completed' ? (
              <Check
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-emerald-600"
              />
            ) : step.status === 'in_progress' && active ? (
              <Loader2
                aria-hidden
                className="mt-0.5 size-4 shrink-0 animate-spin"
              />
            ) : (
              <Circle
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-primary/40"
              />
            )}
            <span
              className={step.status === 'completed' ? 'text-primary/60' : ''}
            >
              {step.step}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
