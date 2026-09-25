import { useConfig } from '@opencx/widget-react-headless';
import React, { useLayoutEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '../motion';
import { handleCompanionFrameKeyDown } from './companion-keyboard';
import { FrameDocument } from '../components/FrameDocument';
import { SuggestedReplyButton } from '../components/SuggestedReplyButton';

/** A separate surface: questions must never resize the animated composer. */
export function CompanionQuestions({
  onHeightChange,
  maxHeight,
  onDismiss,
  onToggleFullscreen,
}: {
  onHeightChange: (height: number) => void;
  maxHeight: number;
  onDismiss: () => void;
  onToggleFullscreen: () => void;
}) {
  const { initialQuestions } = useConfig();
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const report = () => onHeightChange(node.offsetHeight);
    report();
    const Observer = node.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    const observer = new Observer(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeightChange, maxHeight]);

  return (
    <FrameDocument>
      <div
        ref={ref}
        onKeyDown={(event) =>
          handleCompanionFrameKeyDown(event.nativeEvent, {
            state: 'input',
            onDismiss,
            onToggleFullscreen,
          })
        }
        data-companion-questions
        style={{ maxHeight }}
        className="flex min-w-0 flex-col items-start gap-2 overflow-y-auto p-1"
      >
        {initialQuestions
          ?.filter((question) => question.trim().length > 0)
          .map((question, index) => (
            <motion.div
              key={`${question}-${index}`}
              className="max-w-full"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.3,
                delay: reduceMotion ? 0 : 0.2 + Math.min(index, 5) * 0.1,
                ease: EASE_OUT,
              }}
            >
              <SuggestedReplyButton
                suggestion={question}
                type="button"
                variant="secondary"
                wobble={false}
                className="max-w-full whitespace-normal break-words rounded-full bg-muted-foreground px-4 py-2 text-start text-base text-background hover:bg-foreground [@media(pointer:coarse)]:min-h-12"
              />
            </motion.div>
          ))}
      </div>
    </FrameDocument>
  );
}
