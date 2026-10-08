import * as PopoverPrimitive from '@radix-ui/react-popover';
import IFrame from '@uiw/react-iframe';
import { AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import React from 'react';
import {
  useConfig,
  useUnread,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';
import { buildFrameHtml, FrameDocument } from './components/FrameDocument';
import { MotionDiv } from './components/lib/MotionDiv';
import { cn } from './components/lib/utils/cn';
import { Wobble, WOBBLE_MAX_MOVEMENT_PIXELS } from './components/lib/wobble';
import { ChatBubbleSvg } from './components/svg/ChatBubbleSvg';
import {
  UnreadBadge,
  unreadMarkInsetOnDisc,
  useUnreadLabel,
  useUnreadLook,
} from './components/UnreadBadge';
import { useTheme } from './hooks/useTheme';
import { useTriggerLabel } from './hooks/useTriggerLabel';
import { dc } from './utils/data-component';
import { renderCustomTrigger } from './utils/render-custom-trigger';

const initialContent = buildFrameHtml({ transparent: true });

/** Room around the button so the unread mark can sit on its corner. */
const BADGE_OVERHANG_PIXELS = 6;
const FRAME_PADDING_PIXELS = {
  x: WOBBLE_MAX_MOVEMENT_PIXELS.x + BADGE_OVERHANG_PIXELS,
  y: WOBBLE_MAX_MOVEMENT_PIXELS.y + BADGE_OVERHANG_PIXELS,
};

/** Keep the button where the theme offset puts it, despite the frame padding. */
const offsetMinusOverhang = (offset: number | string) =>
  typeof offset === 'number' ? offset - BADGE_OVERHANG_PIXELS : offset;

function WidgetPopoverTrigger() {
  const { isOpen, setIsOpen } = useWidgetTrigger();
  const { assets, customComponents } = useConfig();
  const { count: unreadCount } = useUnread();
  const unreadLabel = useUnreadLabel(unreadCount);
  const showUnreadCount = useUnreadLook() === 'count';
  const { theme, triggerSide } = useTheme();
  const badgeInset = unreadMarkInsetOnDisc(
    theme.widgetTrigger.size.button,
    showUnreadCount,
  );

  const baseLabel = useTriggerLabel();
  const triggerLabel =
    unreadLabel && !isOpen ? `${baseLabel} · ${unreadLabel}` : baseLabel;

  if (customComponents?.widgetTrigger) {
    return renderCustomTrigger(
      customComponents.widgetTrigger,
      isOpen,
      setIsOpen,
      unreadCount,
    );
  }

  return (
    <IFrame
      initialContent={initialContent}
      title="OpenCX Live Chat Trigger"
      style={{
        height: `calc(${theme.widgetTrigger.size.button}px + ${FRAME_PADDING_PIXELS.y * 2}px)`,
        width: `calc(${theme.widgetTrigger.size.button}px + ${FRAME_PADDING_PIXELS.x * 2}px)`,
        fontSize: '16px',
        position: 'fixed',
        zIndex: theme.widgetTrigger.zIndex,
        right: offsetMinusOverhang(theme.widgetTrigger.offset.right),
        bottom: offsetMinusOverhang(theme.widgetTrigger.offset.bottom),
        left: offsetMinusOverhang(theme.widgetTrigger.offset.left),

        // reset iframe defaults
        boxSizing: 'border-box',
        borderWidth: '0px',
        background: 'transparent',
      }}
    >
      <FrameDocument
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PopoverPrimitive.PopoverTrigger
          aria-label={triggerLabel}
          title={triggerLabel}
          className={cn(
            'relative font-sans flex items-center justify-center rounded-full',
          )}
          style={{
            height: theme.widgetTrigger.size.button,
            width: theme.widgetTrigger.size.button,
          }}
        >
          {!isOpen && (
            <UnreadBadge
              count={unreadCount}
              // The top corner on the launcher's docked side. The frame's text
              // direction follows the widget language, the launcher's side
              // follows the host page, so an inline-end inset can land on the
              // inner corner.
              style={{ top: badgeInset, [triggerSide]: badgeInset }}
            />
          )}
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
      </FrameDocument>
    </IFrame>
  );
}

export { WidgetPopoverTrigger };
