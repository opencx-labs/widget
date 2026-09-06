import { useReducedMotion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { cn } from './utils/cn';

const SNAKE_FRAMES = ['⠏', '⠗', '⠧', '⠷', '⠾', '⠽', '⠻', '⠟'];

/**
 * The braille "snake": the widget's indeterminate-progress glyph for agent
 * work (live reasoning, a turn still producing). One static frame under
 * reduced motion.
 */
export function BrailleSpinner({ className }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (shouldReduceMotion) return;
    const id = setInterval(
      () => setFrame((f) => (f + 1) % SNAKE_FRAMES.length),
      80,
    );
    return () => clearInterval(id);
  }, [shouldReduceMotion]);
  return (
    <span className={cn('select-none', className)} aria-hidden>
      {SNAKE_FRAMES[frame]}
    </span>
  );
}
