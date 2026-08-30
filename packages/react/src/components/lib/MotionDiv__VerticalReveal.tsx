import React from 'react';
import { MotionDiv, type MotionDivProps } from './MotionDiv';
import { cn } from './utils/cn';

export const MotionDiv__VerticalReveal = React.forwardRef<
  HTMLDivElement,
  MotionDivProps
>((props, ref) => {
  return (
    <MotionDiv
      {...props}
      ref={ref}
      className={cn('overflow-hidden', props.className)}
      overrides={{
        initial: { height: 0, opacity: 0, ...props.overrides?.initial },
        animate: { height: 'auto', opacity: 1, ...props.overrides?.animate },
        exit: { height: 0, opacity: 0, ...props.overrides?.exit },
      }}
    />
  );
});
MotionDiv__VerticalReveal.displayName = 'MotionDiv__VerticalReveal';
