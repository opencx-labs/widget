import * as PopoverPrimitive from '@radix-ui/react-popover';
import IFrame from '@uiw/react-iframe';
import { AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import React from 'react';
import styles from '../index.css?inline.css';
import { useConfig, useWidgetTrigger } from '@opencx/widget-react-headless';
import { MotionDiv } from './components/lib/MotionDiv';
import { cn } from './components/lib/utils/cn';
import { Wobble, WOBBLE_MAX_MOVEMENT_PIXELS } from './components/lib/wobble';
import { ChatBubbleSvg } from './components/svg/ChatBubbleSvg';
import { useTheme } from './hooks/useTheme';
import { dc } from './utils/data-component';

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
</head>
<body>
</body>
</html>`;

function WidgetPopoverTrigger() {
  const { isOpen, setIsOpen } = useWidgetTrigger();
  const { cssOverrides, assets, customComponents } = useConfig();
  const { theme, cssVars } = useTheme();

  if (customComponents?.widgetTrigger) {
    return customComponents.widgetTrigger({
      react: React,
      isOpen,
      setIsOpen: (open: boolean) => setIsOpen(open),
    });
  }

  return (
    <IFrame
      initialContent={initialContent}
      title="OpenCX Live Chat Trigger"
      style={{
        height: `calc(${theme.widgetTrigger.size.button}px + ${WOBBLE_MAX_MOVEMENT_PIXELS.x * 2}px)`,
        width: `calc(${theme.widgetTrigger.size.button}px + ${WOBBLE_MAX_MOVEMENT_PIXELS.y * 2}px)`,
        fontSize: '16px',
        position: 'fixed',
        zIndex: theme.widgetTrigger.zIndex,
        right: theme.widgetTrigger.offset.right,
        bottom: theme.widgetTrigger.offset.bottom,
        left: theme.widgetTrigger.offset.left,

        // reset iframe defaults
        boxSizing: 'border-box',
        borderWidth: '0px',

        // A quick fix for the white square background of the iframe when the hosting website switches to dark mode
        borderRadius: '100%',
      }}
    >
      {cssOverrides && <style>{cssOverrides}</style>}
      <div
        style={{
          ...cssVars,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PopoverPrimitive.PopoverTrigger
          className={cn(
            'font-sans flex items-center justify-center rounded-full',
          )}
          style={{
            height: theme.widgetTrigger.size.button,
            width: theme.widgetTrigger.size.button,
          }}
        >
          <Wobble>
            <div
              {...dc('trigger/btn')}
              className={cn(
                'relative size-full rounded-full',
                'flex items-center justify-center',
                'overflow-hidden',
                'transition-all',
                'bg-primary',
                'text-primary-foreground',
              )}
            >
              <AnimatePresence mode="wait">
                {isOpen ? (
                  <MotionDiv
                    key="x-icon"
                    snapExit
                    fadeIn="up"
                    overrides={{
                      initial: { rotate: 45 },
                      animate: { rotate: 0 },
                    }}
                  >
                    {assets?.widgetTrigger?.closeIcon ? (
                      <img
                        src={assets.widgetTrigger.closeIcon}
                        alt="Widget trigger close icon"
                        style={{
                          width: theme.widgetTrigger.size.icon,
                          height: theme.widgetTrigger.size.icon,
                        }}
                      />
                    ) : (
                      <ChevronDownIcon
                        style={{
                          width: theme.widgetTrigger.size.icon,
                          height: theme.widgetTrigger.size.icon,
                        }}
                      />
                    )}
                  </MotionDiv>
                ) : (
                  <MotionDiv
                    key="message-icon"
                    snapExit
                    overrides={{
                      initial: { rotate: 45 },
                      animate: { rotate: 0 },
                    }}
                  >
                    {assets?.widgetTrigger?.openIcon ? (
                      <img
                        src={assets.widgetTrigger.openIcon}
                        alt="Widget trigger open icon"
                        style={{
                          width: theme.widgetTrigger.size.icon,
                          height: theme.widgetTrigger.size.icon,
                        }}
                      />
                    ) : (
                      <ChatBubbleSvg
                        style={{
                          width: theme.widgetTrigger.size.icon,
                          height: theme.widgetTrigger.size.icon,
                        }}
                        className="mt-0.5 opacity-95"
                      />
                    )}
                  </MotionDiv>
                )}
              </AnimatePresence>
            </div>
          </Wobble>
        </PopoverPrimitive.PopoverTrigger>
      </div>
    </IFrame>
  );
}

export { WidgetPopoverTrigger };
