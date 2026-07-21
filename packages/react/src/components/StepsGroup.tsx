import type { StreamingStep } from '@opencx/widget-core';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { dc } from '../utils/data-component';
import { cn } from './lib/utils/cn';

/**
 * The companion's steps trace, ported from the dashboard's ai-kit
 * (`agent-turn-chain.tsx` + `pixel-loader.tsx` + `braille-spinner.tsx`):
 * pixel-mosaic loaders on running steps, braille snake on live reasoning,
 * shimmering labels, crossfading current-step name while collapsed, a
 * breadcrumb once done, fade-up row entrances, and auto-collapse when the
 * stream ends. Shared by the LIVE streamed turn and persisted `stepsBefore`
 * from history, so the transcript looks identical during and after a turn.
 */

const STEP_KEYFRAMES = `
@keyframes ocx-text-shimmer { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
@keyframes ocx-fade-up {
  from { opacity: 0; filter: blur(4px); transform: translateY(8px); }
  to { opacity: 1; filter: blur(0px); transform: translateY(0); }
}
@keyframes ocx-placeholder-in {
  from { opacity: 0; transform: translateY(4px); filter: blur(1px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes ocx-placeholder-out {
  from { opacity: 1; transform: translateY(0); filter: blur(0); }
  to { opacity: 0; transform: translateY(-8px); filter: blur(1px); }
}
.ocx-text-shimmer { animation: ocx-text-shimmer 2.5s ease-in-out infinite; }
.ocx-fade-up { animation: ocx-fade-up 0.3s ease-out both; }
.ocx-placeholder-in { animation: ocx-placeholder-in 0.2s ease-out both; }
.ocx-placeholder-out { animation: ocx-placeholder-out 0.18s ease-in both; }
`;

/** 3x3 pixel mosaic loader — random cells light up each tick (ai-kit port). */
function PixelLoader({ className }: { className?: string }) {
  const [active, setActive] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const indices = Array.from({ length: 9 }, (_, i) => i);
    const id = setInterval(() => {
      const count = 2 + Math.floor(Math.random() * 3);
      const shuffled = [...indices]
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
      setActive(new Set(shuffled));
    }, 110);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={cn('inline-grid shrink-0 grid-cols-3', className)}
      style={{ gap: 1, width: 14, height: 14 }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className="rounded-[1px]"
          style={{
            width: 4,
            height: 4,
            background: active.has(i)
              ? 'hsl(var(--opencx-foreground))'
              : 'hsl(var(--opencx-border))',
            transition: 'background 66ms ease',
          }}
        />
      ))}
    </div>
  );
}

const SNAKE_FRAMES = ['⠏', '⠗', '⠧', '⠷', '⠾', '⠽', '⠻', '⠟'];

function BrailleSpinner({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setFrame((f) => (f + 1) % SNAKE_FRAMES.length),
      80,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <span className={cn('select-none', className)} aria-hidden>
      {SNAKE_FRAMES[frame]}
    </span>
  );
}

/** Crossfades the latest step label while the chain is collapsed + running. */
function VanishingLabel({ labels, active }: { labels: string[]; active: boolean }) {
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const [current, setCurrent] = useState(() => labels[labels.length - 1] ?? '');
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const prevLengthRef = useRef(labels.length);

  useEffect(() => {
    const len = labelsRef.current.length;
    if (!active || len <= prevLengthRef.current) {
      prevLengthRef.current = len;
      return;
    }
    prevLengthRef.current = len;
    const latest = labelsRef.current[len - 1] ?? '';
    setPhase('out');
    const tid = setTimeout(() => {
      setCurrent(latest);
      setPhase('in');
    }, 180);
    return () => clearTimeout(tid);
  }, [active, labels.length]);

  return (
    <span
      className={cn(
        'truncate text-[12px] text-muted-foreground/60',
        active && (phase === 'in' ? 'ocx-placeholder-in' : 'ocx-placeholder-out'),
      )}
    >
      {current}
    </span>
  );
}

function stepLabel(step: StreamingStep): string {
  if (step.kind === 'tool') return formatToolLabel(step.label);
  const line = step.label.split('\n').find((l) => l.trim());
  if (!line) return 'Thinking...';
  return line.length > 40 ? `${line.slice(0, 40)}...` : line;
}

function buildBreadcrumb(steps: StreamingStep[], maxItems = 3): string {
  const labels = steps
    .filter((step) => step.kind === 'tool')
    .map((step) => formatToolLabel(step.label));
  if (labels.length === 0) {
    const firstThought = steps.find((step) => step.kind === 'reasoning');
    return firstThought ? stepLabel(firstThought) : 'Thinking...';
  }
  if (labels.length <= maxItems) return labels.join(' → ');
  return `${labels.slice(0, maxItems).join(' → ')} → ...`;
}

function ThoughtRow({ step, isLive }: { step: StreamingStep; isLive: boolean }) {
  const [open, setOpen] = useState(false);
  const label = stepLabel(step);
  const isTruncated = label !== step.label.trim();

  const displayLabel = isLive
    ? (() => {
        const lines = step.label.split('\n').filter((l) => l.trim());
        const last = lines[lines.length - 1] ?? 'Thinking...';
        return last.length > 80 ? `${last.slice(0, 80)}...` : last;
      })()
    : label;

  return (
    <div className="min-w-0">
      <div
        className={cn(
          'flex min-w-0 items-center gap-2.5 py-[3px]',
          isTruncated && 'cursor-pointer',
        )}
        onClick={() => isTruncated && setOpen((v) => !v)}
      >
        <div className="relative z-10 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-background">
          {isLive ? (
            <BrailleSpinner className="text-[14px] leading-none text-primary/70" />
          ) : (
            <span className="text-[14px] leading-none text-muted-foreground/40">
              ⠿
            </span>
          )}
        </div>
        <span
          className={cn(
            'min-w-0 truncate text-[13px] italic text-muted-foreground/60',
            isLive && 'ocx-text-shimmer',
          )}
        >
          {displayLabel}
        </span>
        {isTruncated && (
          <ChevronRightIcon
            className={cn(
              'size-2.5 shrink-0 text-muted-foreground/40 transition-transform duration-200',
              open && 'rotate-90',
            )}
          />
        )}
      </div>
      {isTruncated && open && (
        <div className="ocx-fade-up ml-[30px]">
          <div className="max-h-[160px] overflow-y-auto py-1.5 text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
            {step.label}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolRow({ step }: { step: StreamingStep }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 py-[3px]">
      <div className="relative z-10 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-background">
        {step.done ? (
          <div className="size-1.5 rounded-full bg-muted-foreground/30" />
        ) : (
          <PixelLoader />
        )}
      </div>
      <span
        className={cn(
          'min-w-0 truncate text-[13px] text-muted-foreground/70',
          !step.done && 'ocx-text-shimmer',
        )}
      >
        {formatToolLabel(step.label)}
      </span>
    </div>
  );
}

export function StepsGroup({ steps }: { steps: StreamingStep[] }) {
  const isStreaming = steps.some((step) => !step.done);
  const [isOpen, setIsOpen] = useState(isStreaming);
  const wasStreamingRef = useRef(isStreaming);

  // Auto-collapse when the run finishes (ai-kit behavior).
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) setIsOpen(false);
    else if (!wasStreamingRef.current && isStreaming) setIsOpen(true);
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  if (steps.length === 0) return null;

  return (
    <div
      {...dc('chat/streaming_turn/steps')}
      className="w-full min-w-0 overflow-hidden"
    >
      <style>{STEP_KEYFRAMES}</style>
      <button
        type="button"
        className="flex min-w-0 max-w-full items-center gap-1.5 py-0.5 text-[12px] text-muted-foreground/60 transition-colors duration-150 hover:text-muted-foreground"
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen ? (
          <>
            <ChevronDownIcon className="size-2.5 shrink-0" />
            <span className="text-[11px] font-medium tabular-nums">
              {steps.length}
            </span>
            <span
              className={cn(
                'text-muted-foreground/40',
                isStreaming && 'ocx-text-shimmer',
              )}
            >
              {isStreaming ? 'running...' : 'steps'}
            </span>
          </>
        ) : isStreaming ? (
          <>
            <PixelLoader className="opacity-70" />
            <span className="text-[11px] font-medium tabular-nums">
              {steps.length}
            </span>
            <VanishingLabel labels={steps.map(stepLabel)} active={isStreaming} />
          </>
        ) : (
          <>
            <ChevronRightIcon className="size-2.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left text-[12px] text-muted-foreground/50">
              {buildBreadcrumb(steps)}
            </span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="relative pt-1">
          {steps.length > 1 && (
            <div className="absolute bottom-3 left-2 top-3 border-l border-dashed border-muted-foreground/20" />
          )}
          {steps.map((step, index) => (
            <div
              key={index}
              className="ocx-fade-up"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {step.kind === 'reasoning' ? (
                <ThoughtRow
                  step={step}
                  isLive={isStreaming && index === steps.length - 1}
                />
              ) : (
                <ToolRow step={step} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** `list_training_scenarios` → "List training scenarios". */
function formatToolLabel(toolName: string): string {
  const words = toolName.replaceAll(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
