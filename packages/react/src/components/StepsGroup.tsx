import { useConfig, type StreamingStep } from '@opencx/widget-react-headless';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { dc } from '../utils/data-component';
import { useTranslation } from '../hooks/useTranslation';
import { stripInlineMarkdown } from '../utils/strip-inline-markdown';
import { RichText } from './RichText';
import { cn } from './lib/utils/cn';

/**
 * The agent's steps trace: pixel-mosaic loaders on running steps, a braille
 * snake on live reasoning, shimmering labels, a crossfading current-step name
 * while collapsed, a breadcrumb once done, fade-up row entrances, and
 * auto-collapse when the stream ends. Shared by the LIVE streamed turn and
 * settled turns rebuilt from persisted `ui_parts`, so the transcript looks
 * identical during and after a turn. The animation classes live in
 * `index.css`.
 */

/** 3x3 pixel mosaic loader — random cells light up each tick. */
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
function VanishingLabel({
  labels,
  active,
}: {
  labels: string[];
  active: boolean;
}) {
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
        active &&
          (phase === 'in' ? 'opencx-placeholder-in' : 'opencx-placeholder-out'),
      )}
    >
      {current}
    </span>
  );
}

/** Reasoning is markdown, so every one-line label is flattened before it is
 *  cut — a truncated line cannot render `**bold**`, it can only show the
 *  asterisks. The expanded body renders the markdown for real. */
function stepLabel(step: StreamingStep, thinkingLabel: string): string {
  if (step.kind === 'tool') return formatToolLabel(step.label);
  const line = step.label.split('\n').find((l) => l.trim());
  if (!line) return thinkingLabel;
  const plain = stripInlineMarkdown(line);
  if (!plain) return thinkingLabel;
  return plain.length > 40 ? `${plain.slice(0, 40)}...` : plain;
}

function buildBreadcrumb(
  steps: StreamingStep[],
  thinkingLabel: string,
  maxItems = 3,
): string {
  const labels = steps
    .filter((step) => step.kind === 'tool')
    .map((step) => formatToolLabel(step.label));
  if (labels.length === 0) {
    const firstThought = steps.find((step) => step.kind === 'reasoning');
    return firstThought
      ? stepLabel(firstThought, thinkingLabel)
      : thinkingLabel;
  }
  if (labels.length <= maxItems) return labels.join(' → ');
  return `${labels.slice(0, maxItems).join(' → ')} → ...`;
}

/**
 * Typography for the expanded reasoning. `prose` carries its own gray palette
 * and its own margins, both wrong here: the trace is muted-foreground at 13px
 * inside a 160px scroll box, so the palette is repointed at the widget's theme
 * vars (which follow the embedder's colors) and the block rhythm is tightened
 * to something that fits. Edge margins go last — a leading `mt` on the first
 * paragraph reads as a broken gap under the row it belongs to.
 */
const THOUGHT_PROSE = [
  'prose prose-sm max-w-none',
  '[--tw-prose-body:hsl(var(--opencx-muted-foreground))]',
  '[--tw-prose-headings:hsl(var(--opencx-foreground))]',
  '[--tw-prose-bold:hsl(var(--opencx-foreground))]',
  '[--tw-prose-code:hsl(var(--opencx-foreground))]',
  '[--tw-prose-links:hsl(var(--opencx-primary))]',
  '[--tw-prose-bullets:hsl(var(--opencx-muted-foreground))]',
  '[--tw-prose-counters:hsl(var(--opencx-muted-foreground))]',
  '[--tw-prose-quotes:hsl(var(--opencx-muted-foreground))]',
  '[--tw-prose-quote-borders:hsl(var(--opencx-border))]',
  '[--tw-prose-hr:hsl(var(--opencx-border))]',
  '[--tw-prose-pre-bg:hsl(var(--opencx-muted))]',
  '[--tw-prose-pre-code:hsl(var(--opencx-foreground))]',
  'prose-p:my-1 prose-headings:my-1.5 prose-headings:text-[13px]',
  'prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5',
  'prose-pre:my-1.5 prose-pre:p-2 prose-pre:text-[11px] prose-hr:my-2',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
].join(' ');

function ThoughtRow({
  step,
  isLive,
  thinkingLabel,
}: {
  step: StreamingStep;
  isLive: boolean;
  thinkingLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const label = stepLabel(step, thinkingLabel);
  // Compare against the FLATTENED reasoning: a single-line `**foo**` collapses
  // to the same `foo` the label shows, and offering a disclosure that reveals
  // nothing new (beyond the asterisks) is worse than no disclosure.
  const isTruncated = label !== stripInlineMarkdown(step.label);

  const displayLabel = isLive
    ? (() => {
        const lines = step.label.split('\n').filter((l) => l.trim());
        const last = stripInlineMarkdown(lines[lines.length - 1] ?? '');
        if (!last) return thinkingLabel;
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
            isLive && 'opencx-text-shimmer',
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
        <div className="opencx-fade-up ms-[30px]">
          <div
            className={cn(
              'max-h-[160px] overflow-y-auto py-1.5 text-[13px] leading-relaxed [overflow-wrap:anywhere]',
              THOUGHT_PROSE,
            )}
          >
            <RichText>{step.label}</RichText>
          </div>
        </div>
      )}
    </div>
  );
}

/** Longest tool payload rendered, in characters. Debug view, not a data dump:
 *  a 200KB tool result belongs in the logs, not in a chat bubble. */
const TOOL_IO_MAX_CHARS = 4000;

/** Pretty-print a tool payload for reading, capped. Strings pass through as
 *  themselves — JSON-quoting a plain string helps nobody. */
function formatToolPayload(value: unknown): string {
  const text =
    typeof value === 'string' ? value : (safeStringify(value) ?? String(value));
  return text.length > TOOL_IO_MAX_CHARS
    ? `${text.slice(0, TOOL_IO_MAX_CHARS)}…`
    : text;
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // Circular / non-serializable payloads must not take the trace down.
    return null;
  }
}

function ToolPayload({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="pt-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/50">
        {label}
      </div>
      <pre className="mt-0.5 max-h-[200px] overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {formatToolPayload(value)}
      </pre>
    </div>
  );
}

/**
 * One tool call in the trace. With `showStepToolIO` on, the row is a
 * disclosure: it opens onto the call's arguments and its result, which is what
 * you actually need when an agent's answer is wrong and the label ("Search
 * knowledge base") tells you nothing about what it searched for. Off — the
 * default, and what customers see — it stays exactly the label row it was.
 */
function ToolRow({ step, showIO }: { step: StreamingStep; showIO: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasIO =
    showIO && (step.input !== undefined || step.output !== undefined);

  return (
    <div className="min-w-0">
      <div
        className={cn(
          'flex min-w-0 items-center gap-2.5 py-[3px]',
          hasIO && 'cursor-pointer',
        )}
        onClick={() => hasIO && setOpen((v) => !v)}
      >
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
            !step.done && 'opencx-text-shimmer',
          )}
        >
          {formatToolLabel(step.label)}
        </span>
        {hasIO && (
          <ChevronRightIcon
            className={cn(
              'size-2.5 shrink-0 text-muted-foreground/40 transition-transform duration-200',
              open && 'rotate-90',
            )}
          />
        )}
      </div>
      {hasIO && open && (
        <div className="opencx-fade-up ms-[30px] pb-1">
          {step.input !== undefined && (
            <ToolPayload label={t('step_arguments')} value={step.input} />
          )}
          {step.output !== undefined && (
            <ToolPayload label={t('step_result')} value={step.output} />
          )}
        </div>
      )}
    </div>
  );
}

/** What a registered `agent_chat_steps` component receives. */
export type StreamingStepsComponentProps = {
  steps: StreamingStep[];
  /** The turn is still streaming; false settles every step as done. */
  active: boolean;
};

export function StepsGroup({
  steps: turnSteps,
  active,
}: StreamingStepsComponentProps) {
  const { t } = useTranslation();
  const { showStepToolIO } = useConfig();
  const thinkingLabel = t('thinking');
  // Once the turn is over nothing is running: a turn that ended with a step
  // unfinished — a stopped turn leaves its last tool call at
  // `input-available` — would otherwise shimmer "running..." forever.
  const steps = active
    ? turnSteps
    : turnSteps.map((step) => (step.done ? step : { ...step, done: true }));
  const isStreaming = steps.some((step) => !step.done);
  const [isOpen, setIsOpen] = useState(isStreaming);
  const wasStreamingRef = useRef(isStreaming);

  // Auto-collapse when the run finishes.
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
                isStreaming && 'opencx-text-shimmer',
              )}
            >
              {isStreaming ? t('running') : t('steps')}
            </span>
          </>
        ) : isStreaming ? (
          <>
            <PixelLoader className="opacity-70" />
            <span className="text-[11px] font-medium tabular-nums">
              {steps.length}
            </span>
            <VanishingLabel
              labels={steps.map((step) => stepLabel(step, thinkingLabel))}
              active={isStreaming}
            />
          </>
        ) : (
          <>
            <ChevronRightIcon className="size-2.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-start text-[12px] text-muted-foreground/50">
              {buildBreadcrumb(steps, thinkingLabel)}
            </span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="relative pt-1">
          {steps.length > 1 && (
            <div className="absolute bottom-3 start-2 top-3 border-s border-dashed border-muted-foreground/20" />
          )}
          {steps.map((step, index) => (
            <div
              key={index}
              className="opencx-fade-up"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {step.kind === 'reasoning' ? (
                <ThoughtRow
                  step={step}
                  isLive={isStreaming && index === steps.length - 1}
                  thinkingLabel={thinkingLabel}
                />
              ) : (
                <ToolRow step={step} showIO={showStepToolIO === true} />
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
