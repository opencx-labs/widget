import React, { useLayoutEffect, useRef } from 'react';
import { handleCompanionFrameKeyDown } from './companion-keyboard';
import { FrameDocument } from '../components/FrameDocument';
import { InitialQuestions } from '../components/InitialQuestions';

/** A separate surface: questions must never resize the animated composer. */
export function CompanionQuestions({
  onHeightChange,
  maxHeight,
  onDismiss,
  onToggleFullscreen,
  onConfirmingChange,
}: {
  onHeightChange: (height: number) => void;
  maxHeight: number;
  onDismiss: () => void;
  onToggleFullscreen: () => void;
  onConfirmingChange: (confirming: boolean) => void;
}) {
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
        <InitialQuestions companion onConfirmingChange={onConfirmingChange} />
      </div>
    </FrameDocument>
  );
}
