import {
  formatAskQuestionsAnswers,
  useMessages,
  type AskQuestionsRequest,
} from '@opencx/widget-react-headless';
import { ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { dc } from '../utils/data-component';
import { cn } from './lib/utils/cn';

/**
 * The `ask_questions` clarification card.
 *
 * The agent asking a question is not activity to trace — it is a message
 * addressed to the customer. So this call never renders in the steps group;
 * the stream mapper lifts it out and this card shows the QUESTION, one at a
 * time, with the offered options as chips and an always-available "type it
 * yourself" escape. Answers are submitted as ONE ordinary user message, which
 * is what the agent reads as the tool's result.
 */
export type ClarificationQuestionsProps = {
  request: AskQuestionsRequest;
};

type Question = AskQuestionsRequest['questions'][number];

/** The answer text for one question, or `undefined` while unanswered. */
function answerFor(params: {
  question: Question;
  manual: boolean;
  manualText: string;
  singleId: string | undefined;
  multiIds: ReadonlySet<string>;
}): string | undefined {
  if (params.manual) {
    const typed = params.manualText.trim();
    return typed.length > 0 ? typed : undefined;
  }
  if (params.question.selection === 'single') {
    if (!params.singleId) return undefined;
    return params.question.options.find((o) => o.id === params.singleId)?.label;
  }
  const labels = Array.from(params.multiIds)
    .map((id) => params.question.options.find((o) => o.id === id)?.label)
    .filter(
      (label): label is string => typeof label === 'string' && label.length > 0,
    );
  return labels.length > 0 ? labels.join(', ') : undefined;
}

export function ClarificationQuestions({
  request,
}: ClarificationQuestionsProps) {
  const { t } = useTranslation();
  const { sendMessage } = useMessages();
  const questions = request.questions;

  const [index, setIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [manualText, setManualText] = useState<Record<string, string>>({});
  const [singleSel, setSingleSel] = useState<
    Record<string, string | undefined>
  >({});
  const [multiSel, setMultiSel] = useState<Record<string, Set<string>>>({});

  const question = questions[index];
  const total = questions.length;

  const isAnswered = useCallback(
    (candidate: Question) =>
      answerFor({
        question: candidate,
        manual: Boolean(manual[candidate.id]),
        manualText: manualText[candidate.id] ?? '',
        singleId: singleSel[candidate.id],
        multiIds: multiSel[candidate.id] ?? new Set<string>(),
      }) !== undefined,
    [manual, manualText, multiSel, singleSel],
  );

  const currentAnswered = question ? isAnswered(question) : false;
  const allAnswered = useMemo(
    () => questions.every((candidate) => isAnswered(candidate)),
    [isAnswered, questions],
  );

  const chooseSingle = useCallback((questionId: string, optionId: string) => {
    setSingleSel((prev) => ({ ...prev, [questionId]: optionId }));
    setManual((prev) => ({ ...prev, [questionId]: false }));
  }, []);

  const toggleMulti = useCallback((questionId: string, optionId: string) => {
    setMultiSel((prev) => {
      const set = new Set(prev[questionId] ?? []);
      if (set.has(optionId)) set.delete(optionId);
      else set.add(optionId);
      return { ...prev, [questionId]: set };
    });
    setManual((prev) => ({ ...prev, [questionId]: false }));
  }, []);

  const enableManual = useCallback((questionId: string) => {
    setManual((prev) => ({ ...prev, [questionId]: true }));
    setSingleSel((prev) => ({ ...prev, [questionId]: undefined }));
    setMultiSel((prev) => ({ ...prev, [questionId]: new Set<string>() }));
  }, []);

  const goNext = useCallback(() => {
    if (!currentAnswered) return;
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [currentAnswered, total]);

  const submit = useCallback(() => {
    if (submitted || !allAnswered) return;
    const answers = new Map<string, string>();
    for (const candidate of questions) {
      const text = answerFor({
        question: candidate,
        manual: Boolean(manual[candidate.id]),
        manualText: manualText[candidate.id] ?? '',
        singleId: singleSel[candidate.id],
        multiIds: multiSel[candidate.id] ?? new Set<string>(),
      });
      if (text) answers.set(candidate.id, text);
    }
    const content = formatAskQuestionsAnswers(request, answers);
    if (content.trim().length === 0) return;
    // Locked before the send so a double-click cannot answer the same
    // questionnaire twice; the customer's reply then retires it from the
    // composer (`pendingClarification`).
    setSubmitted(true);
    sendMessage({ content });
  }, [
    allAnswered,
    submitted,
    manual,
    manualText,
    multiSel,
    questions,
    request,
    sendMessage,
    singleSel,
  ]);

  if (!question) return null;
  const typing = Boolean(manual[question.id]);

  return (
    <div
      {...dc('chat/clarification_questions/root')}
      className={cn(
        'w-full rounded-2xl border border-border bg-background shadow-sm',
        submitted && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex items-start gap-2.5 px-4 pt-4">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <SparklesIcon className="size-4" />
        </span>
        <p
          {...dc('chat/clarification_questions/prompt')}
          className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground"
        >
          {question.prompt}
        </p>
      </div>

      <div className="px-4 pb-3 pt-3">
        {typing ? (
          <textarea
            {...dc('chat/clarification_questions/manual_input')}
            value={manualText[question.id] ?? ''}
            onChange={(e) =>
              setManualText((prev) => ({
                ...prev,
                [question.id]: e.target.value,
              }))
            }
            placeholder={t('questions_answer_placeholder')}
            rows={3}
            className={cn(
              'w-full resize-none rounded-xl border border-border bg-muted/30 px-3 py-2.5',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey) return;
              e.preventDefault();
              if (index < total - 1) goNext();
              else submit();
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => {
              const active =
                question.selection === 'single'
                  ? singleSel[question.id] === option.id
                  : (multiSel[question.id]?.has(option.id) ?? false);
              return (
                <button
                  {...dc('chat/clarification_questions/option')}
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    question.selection === 'single'
                      ? chooseSingle(question.id, option.id)
                      : toggleMulti(question.id, option.id)
                  }
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-muted/40 text-foreground/90 hover:bg-muted',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
            <button
              {...dc('chat/clarification_questions/type_it')}
              type="button"
              onClick={() => enableManual(question.id)}
              className={cn(
                'rounded-full border border-dashed border-border px-3 py-1.5 text-sm',
                'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t('questions_type_answer')}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <button
          {...dc('chat/clarification_questions/back')}
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeftIcon className="size-3.5" />
          {t('questions_back')}
        </button>
        {total > 1 ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {index + 1} / {total}
          </span>
        ) : null}
        {index < total - 1 ? (
          <button
            {...dc('chat/clarification_questions/next')}
            type="button"
            onClick={goNext}
            disabled={!currentAnswered}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-primary hover:bg-muted disabled:opacity-40"
          >
            {t('questions_next')}
            <ChevronRightIcon className="size-3.5" />
          </button>
        ) : (
          <button
            {...dc('chat/clarification_questions/send')}
            type="button"
            onClick={submit}
            disabled={!allAnswered}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted disabled:opacity-40"
          >
            {t('questions_send')}
          </button>
        )}
      </div>

      <div className="h-1 w-full overflow-hidden rounded-b-2xl bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${((index + 1) / Math.max(1, total)) * 100}%` }}
        />
      </div>
    </div>
  );
}
