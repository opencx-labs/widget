import { useCsat } from '@opencx/widget-react-headless';
import { AnimatePresence } from 'framer-motion';
import { ArrowUpIcon } from 'lucide-react';
import React, { useState } from 'react';
import { useIsSmallScreen } from '../hooks/useIsSmallScreen';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from './lib/button';
import { MotionDiv__VerticalReveal } from './lib/MotionDiv__VerticalReveal';
import { cn } from './lib/utils/cn';

const CSAT_SCORES = [
  {
    label: 'Terrible',
    value: 1,
    emoji: '😡',
  },
  {
    label: 'Poor',
    value: 2,
    emoji: '😞',
  },
  {
    label: 'Okay',
    value: 3,
    emoji: '😐',
  },
  {
    label: 'Good',
    value: 4,
    emoji: '😊',
  },
  {
    label: 'Great',
    value: 5,
    emoji: '😍',
  },
];

export function CsatSurvey() {
  const { isSmallScreen } = useIsSmallScreen();
  const { t } = useTranslation();
  const {
    submitCsat,
    isCsatRequested,
    isCsatSubmitted,
    submittedScore,
    submittedFeedback,
  } = useCsat();

  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleRatingClick = (value: number) => {
    setScore((prev) => (prev === value ? null : value));
  };

  const handleSubmit = () => {
    if (!score) return;
    void submitCsat({
      score: score,
      feedback: feedback || undefined,
    });
  };

  if (!isCsatRequested && !isCsatSubmitted) return null;

  return (
    <div className="w-1/2 min-w-80 max-w-96 mx-auto overflow-hidden">
      {/* ------------------------ TITLE ----------------------- */}
      <AnimatePresence mode="wait">
        {isCsatRequested && !score ? (
          <MotionDiv__VerticalReveal key="csat-requested-title">
            <p className="text-sm text-muted-foreground text-center pt-2">
              {t('csat_title')}
            </p>
          </MotionDiv__VerticalReveal>
        ) : isCsatSubmitted ? (
          <MotionDiv__VerticalReveal key="csat-submitted-title">
            <p className="text-sm text-muted-foreground text-center pt-2">
              {t('csat_submitted_title')}
            </p>
          </MotionDiv__VerticalReveal>
        ) : null}
      </AnimatePresence>

      {/* ------------------------ EMOJI ----------------------- */}
      {/*
        Force LTR so the rating scale always renders 😡(left) → 😍(right),
        independent of the widget's language direction. In RTL (e.g. Arabic)
        an inherited `dir=rtl` would reverse the flex row and surface 😡 first
        to a right-to-left reader, skewing CSAT toward negative scores.
      */}
      <div
        dir="ltr"
        className={cn(
          'flex gap-4 justify-between pt-2 px-2 pb-2',
          'transition-all',
          isCsatSubmitted && 'gap-0 justify-center',
        )}
      >
        {CSAT_SCORES.map((s) => (
          <Button
            variant={s.value === score ? 'secondary' : 'ghost'}
            size="selfless"
            className={cn(
              'transition-all overflow-hidden',
              'text-2xl size-8 rounded-full',
              'opacity-35',
              'hover:opacity-100',
              !score && 'opacity-100',
              s.value === score && 'opacity-100',
              isCsatSubmitted &&
                s.value !== submittedScore &&
                'opacity-0 size-0',
              isCsatSubmitted &&
                s.value === submittedScore &&
                'opacity-100 size-fit text-4xl',
            )}
            key={s.value}
            onClick={
              isCsatRequested ? () => handleRatingClick(s.value) : undefined
            }
          >
            {s.emoji}
          </Button>
        ))}
      </div>

      {/* ------------------------ FEEDBACK ----------------------- */}
      <AnimatePresence mode="wait">
        {(score || submittedScore) && (
          <MotionDiv__VerticalReveal key="feedback-box">
            <div className="pb-2 px-2 flex items-end">
              <textarea
                // Thw `rows` attribute will take effect in browsers that do not support [field-sizing:content;] (Firefox and Safari as of now)
                rows={3}
                className={cn(
                  'transition-all',
                  'max-h-40 [field-sizing:content]',
                  'w-full resize-none',
                  'bg-transparent outline-none',
                  'placeholder:text-muted-foreground',
                  // 16px on mobiles prevents auto-zoom on the input when focused
                  isSmallScreen ? 'text-[16px]' : 'text-sm',
                  isCsatSubmitted && 'text-center',
                )}
                value={
                  isCsatSubmitted ? submittedFeedback || '' : feedback || ''
                }
                onChange={
                  isCsatRequested
                    ? (e) => setFeedback(e.target.value)
                    : undefined
                }
                readOnly={isCsatSubmitted}
                placeholder={
                  isCsatRequested ? t('csat_feedback_placeholder') : undefined
                }
              />
              <Button
                size="fit"
                onClick={handleSubmit}
                disabled={!score}
                className={cn(
                  'transition-all overflow-hidden',
                  'rounded-full size-8 flex items-center justify-center p-0',
                  isCsatSubmitted && 'opacity-0 size-0',
                )}
              >
                <ArrowUpIcon className="size-4" />
              </Button>
            </div>
          </MotionDiv__VerticalReveal>
        )}
      </AnimatePresence>

      {/* ----------------------- SPACER ----------------------- */}
      <div
        className={cn('h-0 transition-[height]', isCsatSubmitted && 'h-4')}
      />
    </div>
  );
}
