import * as PopoverPrimitive from '@radix-ui/react-popover';
import IFrame from '@uiw/react-iframe';
import { motion } from 'framer-motion';
import React from 'react';
import {
  useConfig,
  useWidget,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';
import { buildFrameHtml, FrameDocument } from './components/FrameDocument';
import { useTheme } from './hooks/useTheme';
import { RootScreen } from './screens';

const initialContent = buildFrameHtml();

// Mirrors the companion shell's morph curve (companion/WidgetCompanion.tsx
// `SPRING`): near-critically damped (ratio ≈ 1.0 at stiffness 500 / damping 45)
// so the panel settles snappy without overshoot. The popover keeps its
// opacity + y fade path — this only swaps the easing so open/close rides the
// same curve as the companion morph instead of a flat 150ms tween.
const OPEN_SPRING = {
  type: 'spring',
  stiffness: 500,
  damping: 45,
  mass: 1,
} as const;

export function WidgetContent() {
  const { isOpen } = useWidgetTrigger();
  const { contentIframeRef } = useWidget();
  const { inline } = useConfig();
  const { theme, computed } = useTheme();

  return (
    <motion.div
      animate={isOpen ? 'visible' : 'hidden'}
      initial="hidden"
      // Grow out of the FAB corner (bottom-right, where the trigger sits) so
      // the panel reads as emerging from the button — the companion morph
      // feel. Inline mode keeps its origin (no floating trigger to grow from).
      style={{ transformOrigin: inline ? undefined : 'bottom right' }}
      variants={{
        hidden: {
          opacity: 0,
          // The visible travel: scale up from the corner. Curve-only (opacity
          // + 8px) was imperceptible — the spring needs real distance to feel.
          scale: inline ? 1 : 0.9,
          y: 8,
          transitionEnd: { display: 'none' },
          transition: OPEN_SPRING,
        },
        visible: {
          opacity: 1,
          scale: 1,
          y: 0,
          display: 'block',
          height: inline ? '100%' : undefined,
          // Spring the morph (opacity + scale + y); snap the inline
          // `height: 100%` — a percentage height has no numeric baseline to
          // spring from and would warn / jump. Matches prior height behavior.
          transition: { ...OPEN_SPRING, height: { duration: 0 } },
        },
      }}
    >
      <IFrame
        ref={contentIframeRef}
        initialContent={initialContent}
        allowFullScreen
        title="OpenCX Live Chat"
        style={{
          // @ts-expect-error this is a valid css variable
          '--opencx-widget-width': computed.minWidth,
          '--opencx-widget-height': computed.minHeight,

          minWidth: computed.minWidth,
          width: 'var(--opencx-widget-width)',
          maxWidth: computed.maxWidth, // Relative to the viewport

          minHeight: computed.minHeight,
          height: 'var(--opencx-widget-height)',
          maxHeight: computed.maxHeight, // Relative to the viewport

          overflow: 'hidden',
          /** outline is better than border because of box sizing; the outline wouldn't affect the content inside... the border will mess up how the children's border radius sits with the parent */
          outline: theme.widgetContentContainer.outline,
          outlineColor: theme.widgetContentContainer.outlineColor,
          borderRadius: theme.widgetContentContainer.borderRadius,
          boxShadow: theme.widgetContentContainer.boxShadow,
          transitionProperty: theme.widgetContentContainer.transitionProperty,
          transitionTimingFunction:
            theme.widgetContentContainer.transitionTimingFunction,
          transitionDuration: theme.widgetContentContainer.transitionDuration,

          // reset iframe defaults
          boxSizing: 'border-box',
          borderWidth: '0px',
        }}
      >
        <FrameDocument style={{ zIndex: theme.widgetContentContainer.zIndex }}>
          <RootScreen />
        </FrameDocument>
      </IFrame>
    </motion.div>
  );
}

export function WidgetPopoverContent() {
  const { theme } = useTheme();

  return (
    <PopoverPrimitive.Content
      onInteractOutside={(ev) => ev.preventDefault()}
      forceMount
      style={{
        zIndex: theme.widgetContentContainer.zIndex,
        fontSize: '16px',
      }}
      side="top"
      align="end"
      aria-modal="false"
      aria-label="Support chat"
      sideOffset={theme.widgetContentContainer.offset.side}
      alignOffset={theme.widgetContentContainer.offset.align}
      avoidCollisions={false}
      // do not use `asChild` as it will mess up setting the zIndex correctly on the top-most div
    >
      <WidgetContent />
    </PopoverPrimitive.Content>
  );
}
