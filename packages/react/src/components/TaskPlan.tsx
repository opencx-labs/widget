import type { StreamingTurnItem } from '@opencx/widget-react-headless';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronUp, CircleDashed, Loader2 } from 'lucide-react';
import React, { useId, useState } from 'react';
import { FADE_TRANSITION, QUICK_TWEEN } from '../motion';
import { cn } from './lib/utils/cn';

type PlanStep = Extract<StreamingTurnItem, { kind: 'plan' }>['plan'][number];

/** The assistant supplies plan state; layout and progress indicators belong to the widget. */
export function TaskPlan({
  plan,
  active,
}: {
  plan: PlanStep[];
  active: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const reduceMotion = useReducedMotion();
  const completed = plan.filter((step) => step.status === 'completed').length;
  const currentStep =
    plan.find((step) => step.status === 'in_progress') ??
    plan.find((step) => step.status === 'pending') ??
    plan[0];
  const circumference = 2 * Math.PI * 8;
  const progressOffset =
    circumference * (1 - (plan.length > 0 ? completed / plan.length : 0));

  return (
    <div
      className="overflow-hidden rounded-xl border border-primary/10 bg-background shadow-sm"
      data-task-plan
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-start hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        <svg
          aria-hidden="true"
          className="size-5 shrink-0 -rotate-90"
          viewBox="0 0 20 20"
        >
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary/10"
          />
          <motion.circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: progressOffset }}
            transition={reduceMotion ? { duration: 0 } : FADE_TRANSITION}
            className="text-emerald-600 dark:text-emerald-400"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate text-sm text-primary">
          {currentStep?.step}
        </span>
        <span className="shrink-0 text-[0.8125rem] tabular-nums text-primary/50">
          {completed}/{plan.length}
        </span>
        <motion.span
          aria-hidden="true"
          className="flex size-3.5 shrink-0 items-center justify-center text-primary/50"
          initial={false}
          animate={{ rotate: expanded ? 0 : 180 }}
          transition={reduceMotion ? { duration: 0 } : QUICK_TWEEN}
        >
          <ChevronUp className="size-3.5" />
        </motion.span>
      </button>

      <div id={panelId} aria-hidden={!expanded}>
        <AnimatePresence initial={false}>
          {expanded && (
            // Height makes room for the list without scaling its text. Reduced
            // motion keeps only the fade; ordinary updates retain this panel.
            <motion.div
              key="plan-steps"
              initial={{ height: reduceMotion ? 'auto' : 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{
                height: reduceMotion ? 'auto' : 0,
                opacity: 0,
                transition: QUICK_TWEEN,
              }}
              transition={reduceMotion ? QUICK_TWEEN : FADE_TRANSITION}
              className="overflow-hidden"
            >
              <ol className="max-h-60 overflow-y-auto border-t border-primary/10 px-3.5 py-2">
                {plan.map((step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2.5 py-1.5 text-sm"
                    data-plan-status={step.status}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative mt-0.5 size-4 shrink-0',
                        !active && '[&_.animate-spin]:animate-none',
                      )}
                    >
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={step.status}
                          className="absolute inset-0 flex items-center justify-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={QUICK_TWEEN}
                        >
                          {step.status === 'completed' ? (
                            <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500/10">
                              <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                            </span>
                          ) : step.status === 'in_progress' ? (
                            active ? (
                              <Loader2 className="size-4 animate-spin text-primary/60 motion-reduce:animate-none" />
                            ) : (
                              <CircleDashed className="size-4 text-primary/40" />
                            )
                          ) : (
                            <span className="size-1.5 rounded-full bg-primary/25" />
                          )}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <span
                      className={cn(
                        step.status === 'completed'
                          ? 'text-primary/50 line-through'
                          : step.status === 'in_progress'
                            ? 'font-medium text-primary'
                            : 'text-primary/60',
                      )}
                    >
                      {step.step}
                    </span>
                  </li>
                ))}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
