import { useMessages, useSessions, useWidget } from '@opencx/widget-react-headless';
import { AnimatePresence } from 'framer-motion';
import React, { useRef } from 'react';
import { Header } from '../../components/Header';
import { LoadingSpinner } from '../../components/lib/LoadingSpinner';
import { MotionDiv } from '../../components/lib/MotionDiv';
import { cn } from '../../components/lib/utils/cn';
import { useCanvas } from '../../hooks/useCanvas';
import { useSetWidgetSize } from '../../hooks/useSetWidgetSize';
import { useTheme } from '../../hooks/useTheme';
import { dc } from '../../utils/data-component';
import { AgentChatMain } from './agent/AgentChatMain';
import { AgentChatProvider } from './agent/AgentChatContext';
import { ChatCanvas } from './ChatCanvas';
import { ChatFooter } from './ChatFooter';
import { ChatMain } from './ChatMain';

export function ChatScreen() {
  const {
    messagesState: { isInitialFetchLoading },
  } = useMessages();
  // Agent-v3 (v5) embeds get the useChat-based streaming surface; v1/v2 embeds
  // keep the blocking engine. `agentBound` is a per-instance constant, resolved
  // before the chat renders.
  const { widgetCtx } = useWidget();
  const isAgentBound = widgetCtx.messageCtx.agentBound;
  const {
    sessionState: { session },
  } = useSessions();
  const { isCanvasOpen } = useCanvas();
  const { theme } = useTheme();

  useSetWidgetSize({
    width: isCanvasOpen
      ? theme.screens.chat.withCanvas.width
      : theme.screens.chat.width,
    height: isCanvasOpen
      ? theme.screens.chat.withCanvas.height
      : theme.screens.chat.height,
  });

  // The key is the session id, so that when chat is reset, the animation replays
  const chatContentKeyRef = useRef(session?.id || 'chat').current;

  return (
    <div
      {...dc('chat/root')}
      className={cn('flex flex-col overflow-hidden')}
      style={{
        width: '100vw', // Relative to the iframe
        maxWidth: '100vw', // Relative to the iframe
        height: '100vh', // Relative to the iframe
        maxHeight: '100vh', // Relative to the iframe
      }}
    >
      <div className="size-full justify-between flex flex-col">
        <Header />
        <AnimatePresence mode="wait">
          {isInitialFetchLoading ? (
            <MotionDiv
              key="loading"
              className="flex flex-col items-center justify-center w-full flex-1"
            >
              <LoadingSpinner />
            </MotionDiv>
          ) : (
            <MotionDiv
              key={chatContentKeyRef}
              className="flex items-start h-full flex-1 overflow-auto"
              // If we don't snap exit, the initial questions will show before the animation starts
              snapExit
            >
              <div
                {...dc('chat/main/root')}
                className={cn(
                  'flex flex-col h-full overflow-auto transition-all',
                  isCanvasOpen ? 'w-2/5' : 'w-full',
                )}
                style={{
                  transitionTimingFunction:
                    theme.screens.chat.withCanvas.transitionTimingFunction,
                  transitionDuration:
                    theme.screens.chat.withCanvas.transitionDuration,
                }}
              >
                {isAgentBound ? (
                  <AgentChatProvider>
                    <AgentChatMain />
                    <ChatFooter />
                  </AgentChatProvider>
                ) : (
                  <>
                    <ChatMain />
                    <ChatFooter />
                  </>
                )}
              </div>
              <div
                {...dc('chat/canvas/root')}
                className={cn(
                  'h-full overflow-auto transition-all',
                  isCanvasOpen ? 'w-3/5' : 'w-0',
                )}
                style={{
                  transitionTimingFunction:
                    theme.screens.chat.withCanvas.transitionTimingFunction,
                  transitionDuration:
                    theme.screens.chat.withCanvas.transitionDuration,
                }}
              >
                <ChatCanvas />
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
