import { motion } from 'framer-motion';
import React from 'react';
import { CompanionIcon } from './CompanionIcon';
import { EASE_OUT } from './materials';

/**
 * The resting look of the companion shell: the icon disc, plus a label that
 * reveals to its inline-end when docked. ONE persistent structure — the icon
 * never cross-fades or moves, so collapsed→docked reads as the bar simply
 * growing out to the side and the label fading in, not a full re-render.
 *
 * `CompanionIcon` is self-contained (it carries its own dark head), so the
 * same disc works as the round pill (shell clipped to disc width) and as the
 * dock bar's left cap (shell grown, light background showing past the disc).
 *
 * Growing to the inline-END rather than from the center is done at the shell
 * level in WidgetCompanion (it pins the shell's inline-start edge while the
 * width springs), so here the icon just stays put at inline-start.
 */

// Must match PILL_SIZE in WidgetCompanion: the disc fills the collapsed round
// pill exactly, so it stays put (no resize) as the pill grows into the bar.
const ICON_SIZE = 32;

/** Fades out immediately on open; on close waits for the shell to shrink. */
function restingFade(visible: boolean) {
  return {
    initial: false as const,
    animate: { opacity: visible ? 1 : 0 },
    transition: { duration: 0.15, ease: EASE_OUT, delay: visible ? 0.25 : 0 },
  };
}

export function RestingPill({
  visible,
  docked,
  label,
  icon,
  pillBackground,
  dir,
  measureRef,
}: {
  /** The shell is resting as a pill (vs. morphed open) — show this look */
  visible: boolean;
  /** Expanded into the labeled bar (vs. the icon-only round pill) */
  docked: boolean;
  label: string;
  icon: string | undefined;
  pillBackground: string;
  dir: string;
  /** Measures the natural bar width (disc + label) so the shell springs to it */
  measureRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 'inherit',
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        // Light bar surface; the icon disc carries its own (dark) background,
        // so the collapsed pill — shell clipped to the disc — still reads dark.
        background: 'hsl(var(--opencx-background))',
      }}
      {...restingFade(visible)}
    >
      <div
        ref={measureRef}
        dir={dir}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: '100%',
          width: 'max-content',
          // No inline-start padding: the disc IS the pill's leading cap, so it
          // fills the round pill exactly when collapsed.
          paddingInlineEnd: 12,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <CompanionIcon
          icon={icon}
          pillBackground={pillBackground}
          size={ICON_SIZE}
        />
        <motion.span
          initial={false}
          animate={{ opacity: docked ? 1 : 0 }}
          transition={{ duration: 0.12, ease: EASE_OUT }}
          style={{
            fontSize: 13,
            color: 'hsl(var(--opencx-muted-foreground))',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </motion.span>
      </div>
    </motion.div>
  );
}
