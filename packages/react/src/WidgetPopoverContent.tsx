import * as PopoverPrimitive from '@radix-ui/react-popover';
import IFrame from '@uiw/react-iframe';
import { motion } from 'framer-motion';
import React from 'react';
import styles from '../index.css?inline.css';
import {
  useConfig,
  useDocumentDir,
  useWidget,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';
import { TooltipProvider } from './components/lib/tooltip';
import { cn } from './components/lib/utils/cn';
import { useTheme } from './hooks/useTheme';
import { RootScreen } from './screens';
import { useTranslation } from './hooks/useTranslation';
import { version } from '../package.json';
import { DialogerProvider } from './components/Dialoger';

const initialContent = `<!DOCTYPE html>
<html>
<head>
<style>
${styles}
html, body {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    font-size: 16px;
}
</style>
<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">
</head>
<body>
</body>
</html>`;

export function WidgetContent() {
  const { isOpen } = useWidgetTrigger();
  const { contentIframeRef } = useWidget();
  const { cssOverrides, inline } = useConfig();
  const { theme, cssVars, computed } = useTheme();
  const { dir } = useTranslation();

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
        {cssOverrides && <style>{cssOverrides}</style>}
        <div
          style={{
            ...cssVars,
            zIndex: theme.widgetContentContainer.zIndex,
          }}
          data-version={version}
          className={cn(
            'antialiased font-sans size-full overflow-hidden relative text-secondary-foreground isolate',
          )}
          dir={dir}
        >
          <TooltipProvider
            delayDuration={200}
            // this is important, because without it, the tooltip remains even after moving the mouse away from trigger
            disableHoverableContent
          >
            <DialogerProvider>
              <RootScreen />
            </DialogerProvider>
          </TooltipProvider>
        </div>
      </IFrame>
    </motion.div>
  );
}

export function WidgetPopoverContent() {
  const { theme, triggerSide } = useTheme();
  const { dir: hostDocumentDir } = useDocumentDir();

  // Radix/floating-ui resolves `align` logically against the floating element's
  // computed direction (inherited from the host page via the portal): on an RTL
  // host, 'end' means the physical LEFT edge. Map the resolved physical side
  // back to the logical align so the box always opens on the trigger's side.
  const align =
    (hostDocumentDir === 'rtl' ? triggerSide === 'left' : triggerSide === 'right')
      ? 'end'
      : 'start';

  return (
    <PopoverPrimitive.Content
      onInteractOutside={(ev) => ev.preventDefault()}
      forceMount
      style={{
        zIndex: theme.widgetContentContainer.zIndex,
        fontSize: '16px',
      }}
      side="top"
      align={align}
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
