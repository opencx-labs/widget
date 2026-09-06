import { DictationLevelSmoother } from '@opencx/widget-core';
import type { DictationStatus } from '@opencx/widget-core';
import { AnimatePresence } from 'framer-motion';
import { MicIcon } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { MotionDiv } from '../../components/lib/MotionDiv';
import { Button } from '../../components/lib/button';
import { Tooltippy } from '../../components/lib/tooltip';
import { cn } from '../../components/lib/utils/cn';
import { useTranslation } from '../../hooks/useTranslation';
import { dc } from '../../utils/data-component';
import { COMPOSER_TOOL_ARMED, COMPOSER_TOOL_BUTTON } from './composer-styles';

/**
 * Compact 4-bar voice meter driven by the smoothed mic level (rAF, no
 * re-renders). The moving bars ARE the "it's live" signal.
 */
function DictationLevelBars({ levelRef }: { levelRef: { current: number } }) {
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const smoother = new DictationLevelSmoother({ attack: 0.2, release: 0.07 });
    const lastWritten: string[] = [];
    const tick = () => {
      const bars = barsRef.current?.children;
      if (bars) {
        const smoothed = smoother.next(levelRef.current);
        for (let i = 0; i < bars.length; i++) {
          const bar = bars[i];
          if (bar instanceof HTMLElement) {
            const sway = 0.75 + 0.25 * Math.sin(Date.now() / 260 + i * 1.7);
            const next = `scaleY(${Math.max(0.25, Math.min(1, smoothed * 1.8 * sway)).toFixed(3)})`;
            // Skip identical writes — silence otherwise churns style attrs 60x/s.
            if (lastWritten[i] !== next) {
              bar.style.transform = next;
              lastWritten[i] = next;
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  return (
    <div
      ref={barsRef}
      aria-hidden="true"
      className="flex h-3.5 shrink-0 items-center gap-[3px]"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-full w-[3px] origin-center scale-y-50 rounded-full bg-current transition-transform duration-100 ease-out"
        />
      ))}
    </div>
  );
}

/**
 * Composer microphone toggle, mirroring the attach button. States:
 *   idle       → quiet mic glyph
 *   connecting → spinning arc around the mic
 *   listening  → the mic crossfades into live voice bars that move as you talk
 */
export function DictationMicButton({
  status,
  levelRef,
  onToggle,
  onPrewarm,
}: {
  status: DictationStatus;
  levelRef: { current: number };
  onToggle: () => void;
  /** Hover/focus pre-mints the session token so the click starts instantly. */
  onPrewarm: () => void;
}) {
  const { t } = useTranslation();
  const listening = status === 'listening';
  const connecting = status === 'connecting';
  const label = listening || connecting ? t('stop_dictation') : t('dictate');

  return (
    <Tooltippy side="top" align="start" content={label}>
      <Button
        {...dc('chat/input_box/dictate_btn')}
        onClick={onToggle}
        // Never blur the textarea: dictation appends at the visitor's text.
        onPointerDown={(event) => event.preventDefault()}
        onPointerEnter={onPrewarm}
        onFocus={onPrewarm}
        aria-pressed={listening || connecting}
        aria-label={label}
        size="fit"
        variant="ghost"
        className={cn(
          'relative',
          COMPOSER_TOOL_BUTTON,
          listening && COMPOSER_TOOL_ARMED,
        )}
      >
        {connecting && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0.5 animate-spin rounded-full border-[1.5px] border-current/20 border-t-current"
          />
        )}
        <AnimatePresence mode="wait">
          {listening ? (
            <MotionDiv key="bars" distance={0}>
              <DictationLevelBars levelRef={levelRef} />
            </MotionDiv>
          ) : (
            <MotionDiv key="mic" distance={0}>
              <MicIcon className={cn('size-4', connecting && 'opacity-60')} />
            </MotionDiv>
          )}
        </AnimatePresence>
      </Button>
    </Tooltippy>
  );
}
