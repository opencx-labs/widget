import React from 'react';
import { useConfig, useSessions } from '@opencx/widget-react-headless';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv__VerticalReveal } from '../../components/lib/MotionDiv__VerticalReveal';
import { RichText } from '../../components/RichText';

export function ChatFooterItems() {
  const { sessionState } = useSessions();
  const { chatFooterItems } = useConfig();

  const isSessionResolved =
    !!sessionState.session && !sessionState.session.isOpened;
  const isSessionOpen = !isSessionResolved;

  return (
    <AnimatePresence mode="wait">
      {chatFooterItems?.map((item, i) => {
        if (item.showWhenSessionIsOpen === false && isSessionOpen) {
          return null;
        }
        if (item.showWhenSessionIsResolved === false && isSessionResolved) {
          return null;
        }

        return (
          <MotionDiv__VerticalReveal key={`${item.message}-${i}`}>
            <div className="pb-2 text-center text-xs">
              <RichText>{item.message}</RichText>
            </div>
          </MotionDiv__VerticalReveal>
        );
      })}
    </AnimatePresence>
  );
}
