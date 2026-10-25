import { log } from '@opencx/widget-core';
import {
  useBot,
  useConfig,
  useMessages,
  usePrimitiveState,
  useWidget,
} from '@opencx/widget-react-headless';
import { motion, useReducedMotion } from 'framer-motion';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EASE_OUT } from '../motion';
import { initialQuestionText } from '../utils/initial-question';
import type { InitialQuestion } from '../utils/initial-question';
import { AgentMessageGroup } from './AgentMessageGroup';
import { SuggestedReplyButton } from './SuggestedReplyButton';
import { Button } from './lib/button';
import { cn } from './lib/utils/cn';

type InitialQuestionsProps = {
  companion?: boolean;
  stacked?: boolean;
  className?: string;
  onConfirmingChange?: (confirming: boolean) => void;
};

/** Keep local choices scoped to the current session and configured questions. */
export function InitialQuestions(props: InitialQuestionsProps) {
  const { initialQuestions } = useConfig();
  const { widgetCtx } = useWidget();
  const generation = usePrimitiveState(
    widgetCtx.messageCtx.conversationGeneration,
  );
  // Compare values so a host rebuilding equivalent options preserves a prompt.
  const choicesKey = JSON.stringify(
    initialQuestions?.map((question) => {
      if (typeof question === 'string') return question;
      return [
        question.text,
        question.confirm?.message,
        question.confirm?.confirmLabel,
        question.confirm?.cancelLabel,
        question.confirm?.cancelMessage,
      ];
    }),
  );
  return (
    <InitialQuestionChoices key={`${generation}:${choicesKey}`} {...props} />
  );
}

/** Starter prompts and declined replies are local UI, never session messages. */
function InitialQuestionChoices({
  companion = false,
  stacked = false,
  className,
  onConfirmingChange,
}: InitialQuestionsProps) {
  const { initialQuestions, hooks } = useConfig();
  const { sendMessage, messagesState } = useMessages();
  const bot = useBot();
  const reduceMotion = useReducedMotion();
  const [pending, setPending] = useState<InitialQuestion | null>(null);
  const pendingRef = useRef(pending);
  const [cancelMessage, setCancelMessage] = useState<string>();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  const confirmation =
    typeof pending === 'object' ? pending?.confirm : undefined;

  useEffect(() => {
    onConfirmingChange?.(Boolean(confirmation));
    return () => onConfirmingChange?.(false);
  }, [confirmation, onConfirmingChange]);

  useLayoutEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    rootRef.current?.querySelector('button')?.focus();
  }, [pending]);

  const send = async (question: InitialQuestion) => {
    if (sendingRef.current || messagesState.messages.length > 0) return;
    sendingRef.current = true;
    setSending(true);
    try {
      // Match the existing suggested-reply path, including whitespace trimming.
      await sendMessage({ content: initialQuestionText(question).trim() });
    } catch (error) {
      log.error('Initial question send failed', error);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const select = (question: InitialQuestion) => {
    if (sendingRef.current || pendingRef.current) return;
    setCancelMessage(undefined);
    if (typeof question !== 'string' && question.confirm) {
      focusNext.current = true;
      pendingRef.current = question;
      setPending(question);
    } else {
      void send(question);
    }
  };

  const decide = (confirmed: boolean) => {
    const question = pendingRef.current;
    if (!question || typeof question === 'string' || !question.confirm) return;
    // Consume synchronously: repeated clicks cannot send or fire the hook twice.
    pendingRef.current = null;
    setPending(null);
    if (confirmed) {
      void send(question);
      return;
    }
    focusNext.current = true;
    setCancelMessage(question.confirm.cancelMessage);
    try {
      hooks?.onInitialQuestionDeclined?.({ question: question.text });
    } catch (error) {
      log.error('onInitialQuestionDeclined hook failed', error);
    }
  };

  const localMessage = confirmation?.message ?? cancelMessage;

  return (
    <div ref={rootRef} className={cn('flex flex-col gap-2 w-full', className)}>
      {localMessage && (
        <div aria-live="polite">
          <AgentMessageGroup
            agent={bot}
            actions={false}
            messages={[
              {
                id: 'initial-question-local',
                component: 'bot_message',
                data: { message: localMessage },
                type: 'AI',
                timestamp: null,
              },
            ]}
          />
        </div>
      )}
      {confirmation ? (
        <div className="flex flex-wrap gap-2 ps-8">
          <Button type="button" size="sm" onClick={() => decide(true)}>
            {confirmation.confirmLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => decide(false)}
          >
            {confirmation.cancelLabel}
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'flex gap-2',
            companion || stacked
              ? 'flex-col items-start'
              : 'flex-row justify-end flex-wrap',
          )}
        >
          {initialQuestions
            ?.filter(
              (question) => initialQuestionText(question).trim().length > 0,
            )
            .map((question, index) => {
              const button = (
                <SuggestedReplyButton
                  suggestion={initialQuestionText(question)}
                  type="button"
                  disabled={sending}
                  onClick={() => select(question)}
                  {...(companion
                    ? {
                        variant: 'secondary' as const,
                        wobble: false,
                        className:
                          'max-w-full whitespace-normal break-words rounded-full bg-muted-foreground px-4 py-2 text-start text-base text-background hover:bg-foreground [@media(pointer:coarse)]:min-h-12',
                      }
                    : {})}
                />
              );
              return companion ? (
                <motion.div
                  key={`${initialQuestionText(question)}-${index}`}
                  className="max-w-full"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.3,
                    delay: reduceMotion ? 0 : 0.2 + Math.min(index, 5) * 0.1,
                    ease: EASE_OUT,
                  }}
                >
                  {button}
                </motion.div>
              ) : (
                <React.Fragment
                  key={`${initialQuestionText(question)}-${index}`}
                >
                  {button}
                </React.Fragment>
              );
            })}
        </div>
      )}
    </div>
  );
}
