import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The companion's animated face: two eyes whose pupils track the cursor
 * (spring-smoothed) and blink at random intervals.
 *
 * Rendered in the HOST page DOM (inside the pill, outside any iframe), so it
 * must not rely on Tailwind classes or widget CSS variables — sizing and
 * colors are inline.
 */
export function CompanionFaceIcon({
  size,
  headColor,
  eyeColor,
}: {
  size: number;
  headColor: string;
  eyeColor: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const eyeX = useSpring(rawX, { stiffness: 300, damping: 30 });
  const eyeY = useSpring(rawY, { stiffness: 300, damping: 30 });

  // Pupil offset: small shift within the eye socket
  const leftPupilCx = useTransform(eyeX, (v) => 8 + v * 1.2);
  const leftPupilCy = useTransform(eyeY, (v) => 11.5 + v * 1.2);
  const rightPupilCx = useTransform(eyeX, (v) => 16 + v * 1.2);
  const rightPupilCy = useTransform(eyeY, (v) => 11.5 + v * 1.2);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width * 2);
      const dy = (e.clientY - cy) / (rect.height * 2);
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 1);
      const angle = Math.atan2(dy, dx);
      rawX.set(Math.cos(angle) * dist);
      rawY.set(Math.sin(angle) * dist);
    },
    [rawX, rawY],
  );

  useEffect(() => {
    if (hovered && !shouldReduceMotion) {
      window.addEventListener('mousemove', handleMouseMove);
    } else {
      rawX.set(0);
      rawY.set(0);
    }
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [hovered, handleMouseMove, rawX, rawY, shouldReduceMotion]);

  // Blink loop pauses under reduced motion and in hidden tabs — this ships
  // embedded on third-party pages, so a perpetual background-tab render
  // loop is real cost multiplied by every embedder.
  useEffect(() => {
    if (shouldReduceMotion) return;
    let tickId: ReturnType<typeof setTimeout>;
    let blinkOffId: ReturnType<typeof setTimeout>;
    function stop() {
      clearTimeout(tickId);
      clearTimeout(blinkOffId);
    }
    function tick() {
      tickId = setTimeout(
        () => {
          setBlinking(true);
          blinkOffId = setTimeout(() => setBlinking(false), 150);
          tick();
        },
        1200 + Math.random() * 1800,
      );
    }
    function handleVisibility() {
      stop();
      if (document.visibilityState === 'visible') tick();
    }
    if (document.visibilityState === 'visible') tick();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [shouldReduceMotion]);

  const eyeScaleY = blinking ? 0.15 : 1;

  return (
    <motion.svg
      ref={svgRef}
      viewBox="0 0 24 24"
      style={{ width: size, height: size, flexShrink: 0, display: 'block' }}
      aria-hidden
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Head */}
      <circle cx={12} cy={12} r={11} fill={headColor} />
      {/* Eye sockets */}
      <circle cx={8} cy={11.5} r={3.2} fill={eyeColor} />
      <circle cx={16} cy={11.5} r={3.2} fill={eyeColor} />

      {/* Left pupil */}
      <motion.circle
        cx={leftPupilCx}
        cy={leftPupilCy}
        r={1.4}
        fill={headColor}
        animate={{ scaleY: eyeScaleY }}
        style={{ originX: '8px', originY: '11.5px' }}
        transition={{ duration: 0.08 }}
      />

      {/* Right pupil */}
      <motion.circle
        cx={rightPupilCx}
        cy={rightPupilCy}
        r={1.4}
        fill={headColor}
        animate={{ scaleY: eyeScaleY }}
        style={{ originX: '16px', originY: '11.5px' }}
        transition={{ duration: 0.08 }}
      />
    </motion.svg>
  );
}
