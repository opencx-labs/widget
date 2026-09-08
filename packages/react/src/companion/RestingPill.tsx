import { LoaderCircleIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import React from 'react';
import { PILL_SIZE } from './companion-geometry';
import { CompanionFaceIcon } from './CompanionFaceIcon';
import { EASE_OUT, QUICK_TWEEN } from '../motion';

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

/**
 * The companion's identity mark: the embedder's icon when configured
 * (companion.icon, falling back to their existing trigger icon), the
 * animated face otherwise. Inline-styled so it renders identically in the
 * host DOM (pill, dock) and inside the content iframe (input bar).
 */
function CompanionIcon({
  icon,
  pillBackground,
  size,
}: {
  icon: string | undefined;
  pillBackground: string;
  size: number;
}) {
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: 999,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <CompanionFaceIcon
      size={size}
      headColor={pillBackground}
      eyeColor="hsl(var(--opencx-primary-foreground))"
    />
  );
}

/** Fades out immediately on open; on close waits for the shell to shrink. */
function restingFade(visible: boolean) {
  return {
    initial: false as const,
    animate: { opacity: visible ? 1 : 0 },
    transition: { ...QUICK_TWEEN, delay: visible ? 0.25 : 0 },
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
  activeCount = 0,
  countLabel,
  onOpenChats,
  pickerOpen = false,
  working = false,
  sessions,
}: {
  /** The shell is resting as a pill (vs. morphed open) — show this look */
  sessions?: React.ReactNode;
  activeCount?: number;
  countLabel?: string;
  onOpenChats?: (anchor: HTMLButtonElement, pointer: boolean) => void;
  pickerOpen?: boolean;
  working?: boolean;
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
  const reduceMotion = useReducedMotion();
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
      {visible && !docked && activeCount > 0 && (
        <button
          type="button"
          data-companion-count-trigger=""
          aria-label={countLabel}
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          onClick={(event) => {
            event.stopPropagation();
            onOpenChats?.(event.currentTarget, event.detail > 0);
          }}
          style={{
            position: 'absolute',
            insetInlineStart: 12,
            top: 0,
            zIndex: 2,
            width: 24,
            height: 24,
            padding: 0,
            border: 0,
            background: 'transparent',
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              insetInlineStart: 6,
              top: 0,
              width: 14,
              height: 14,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 999,
              background: 'hsl(var(--opencx-background))',
              color: 'hsl(var(--opencx-foreground))',
              font: '9px ui-sans-serif,system-ui,sans-serif',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {activeCount}
            {working && (
              <motion.span
                style={{ position: 'absolute', inset: -2, display: 'flex' }}
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              >
                <LoaderCircleIcon size={18} />
              </motion.span>
            )}
          </span>
        </button>
      )}
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
          size={PILL_SIZE}
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
        {sessions && (
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              paddingInlineStart: 4,
              opacity: docked ? 1 : 0,
            }}
          >
            {sessions}
          </div>
        )}
      </div>
    </motion.div>
  );
}
