import { useConfig } from '@opencx/widget-react-headless';
import React, { useLayoutEffect, useRef } from 'react';
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
            <SuggestedReplyButton
              key={`${question}-${index}`}
              suggestion={question}
              type="button"
              variant="secondary"
              wobble={false}
              className="max-w-full whitespace-normal break-words rounded-full bg-muted-foreground px-4 py-2 text-start text-base text-background hover:bg-foreground [@media(pointer:coarse)]:min-h-12"
            />
          ))}
      </div>
    </FrameDocument>
  );
}
