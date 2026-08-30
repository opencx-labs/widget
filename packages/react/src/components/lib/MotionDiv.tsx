import React from 'react';
import { motion, type Target } from 'framer-motion';
import { type ComponentProps, forwardRef } from 'react';
import { EASE_OUT } from '../../companion/materials';

type MotionProps = ComponentProps<typeof motion.div>;
type AnimationDirection = 'right' | 'left' | 'up' | 'down';
export type MotionDivProps = MotionProps & {
  fadeIn?: AnimationDirection;
  distance?: number;
  snapExit?: boolean;
  overrides?: Overrides;
  delay?: number;
};

type Overrides = {
  initial?: Target;
  animate?: Target;
  exit?: Target;
};

export const ANIMATION_DISTANCE_PX = 10;

/** One curve and bounded duration for every fade wrapper — MotionDiv is
 * behind nearly every screen/element transition, so this IS the widget's
 * default motion signature. EASE_OUT is the shared token the companion
 * shell and popover already ride (see MOTION.md); before this, MotionDiv
 * fell back to framer's stock tween and read as a different system. Exits
 * reuse the same transition so enter/exit mirror (snapExit opts out). */
const FADE_TRANSITION = { duration: 0.2, ease: EASE_OUT } as const;

/** Exits run 50ms snappier than enters (the sanctioned asymmetry): the user
 * has already moved on — a departing element should get out of the way, not
 * hold the stage as long as it took to arrive. */
const EXIT_TRANSITION = { duration: 0.15, ease: EASE_OUT } as const;

const fadeInRight = (
  distance: number,
  overrides: Overrides,
  delay: number,
): MotionProps => ({
  initial: { opacity: 0, x: -distance, ...overrides.initial },
  animate: {
    opacity: 1,
    x: 0,
    ...overrides.animate,
    transition: { ...FADE_TRANSITION, delay },
  },
  exit: {
    opacity: 0,
    x: distance,
    ...overrides.exit,
    transition: EXIT_TRANSITION,
  },
  transition: FADE_TRANSITION,
});

const fadeInLeft = (
  distance: number,
  overrides: Overrides,
  delay: number,
): MotionProps => ({
  initial: { opacity: 0, x: distance, ...overrides.initial },
  animate: {
    opacity: 1,
    x: 0,
    ...overrides.animate,
    transition: { ...FADE_TRANSITION, delay },
  },
  exit: {
    opacity: 0,
    x: -distance,
    ...overrides.exit,
    transition: EXIT_TRANSITION,
  },
  transition: FADE_TRANSITION,
});

const fadeInUp = (
  distance: number,
  overrides: Overrides,
  delay: number,
): MotionProps => ({
  initial: { opacity: 0, y: distance, ...overrides.initial },
  animate: {
    opacity: 1,
    y: 0,
    ...overrides.animate,
    transition: { ...FADE_TRANSITION, delay },
  },
  exit: {
    opacity: 0,
    y: -distance,
    ...overrides.exit,
    transition: EXIT_TRANSITION,
  },
  transition: FADE_TRANSITION,
});

const fadeInDown = (
  distance: number,
  overrides: Overrides,
  delay: number,
): MotionProps => ({
  initial: { opacity: 0, y: -distance, ...overrides.initial },
  animate: {
    opacity: 1,
    y: 0,
    ...overrides.animate,
    transition: { ...FADE_TRANSITION, delay },
  },
  exit: {
    opacity: 0,
    y: distance,
    ...overrides.exit,
    transition: EXIT_TRANSITION,
  },
  transition: FADE_TRANSITION,
});

const treasureMap: Record<
  AnimationDirection,
  (distance: number, overrides: Overrides, delay: number) => MotionProps
> = {
  right: fadeInRight,
  left: fadeInLeft,
  up: fadeInUp,
  down: fadeInDown,
};

const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>(
  (
    {
      fadeIn = 'down',
      distance = ANIMATION_DISTANCE_PX,
      children,
      snapExit = false,
      overrides = {},
      delay = 0,
      ...props
    },
    ref,
  ) => {
    const fadeInProps: MotionProps = fadeIn
      ? treasureMap[fadeIn](distance, overrides, delay)
      : {};

    if (
      snapExit &&
      fadeInProps.exit &&
      typeof fadeInProps.exit === 'object' &&
      !Array.isArray(fadeInProps.exit)
    ) {
      fadeInProps.exit.transition = { duration: 0 };
    }

    return (
      <motion.div ref={ref} {...props} {...fadeInProps}>
        {children}
      </motion.div>
    );
  },
);
MotionDiv.displayName = 'MotionDiv';

export { MotionDiv };
