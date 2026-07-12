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

export function WidgetContent() {
  const { isOpen } = useWidgetTrigger();
  const { contentIframeRef } = useWidget();
  const { inline } = useConfig();
  const { theme, computed } = useTheme();

  return (
    <motion.div
      animate={isOpen ? 'visible' : 'hidden'}
      initial="hidden"
      variants={{
        hidden: {
          opacity: 0,
          y: 8,
          transitionEnd: { display: 'none' },
          transition: { duration: 0.15 },
        },
        visible: {
          opacity: 1,
          y: 0,
          display: 'block',
          height: inline ? '100%' : undefined,
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
