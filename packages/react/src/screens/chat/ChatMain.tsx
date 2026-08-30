import {
  type LiteralWidgetComponentKey,
  type SafeExtract,
} from '@opencx/widget-core';
import {
  useBot,
  useIsAwaitingBotReply,
  useMessages,
  useWidget,
} from '@opencx/widget-react-headless';
import React, { useEffect, useMemo, useRef } from 'react';
import { SessionResolvedComponent } from '../../components/custom-components/SessionResolvedComponent';
import { dc } from '../../utils/data-component';
import {
  groupMessagesByType,
  isBotMessageGroup,
} from '../../utils/group-messages-by-type';
import { ChatBannerItems } from './ChatBannerItems';
import { ChatCustomStatus } from './ChatCustomStatus';
import { InitialMessages } from './InitialMessages';
import { MessageGroups } from './MessageGroups';
import { ChatBottomComponents } from '../../components/custom-components/ChatBottomComponents';

export function ChatMain() {
  const {
    messagesState: { messages },
  } = useMessages();
  const { isAwaitingBotReply } = useIsAwaitingBotReply();
  const { componentStore } = useWidget();
  // Server-resolved agent branding wins over the local `bot` option.
  const bot = useBot();

  const groupedMessages = useMemo(
    () => groupMessagesByType(messages),
    [messages],
  );

  // While the blocking send awaits its reply, an AI group polled in early
  // must not render above the typing indicator — it would double-render the
  // reply when the send resolves.
  const visibleGroups = useMemo(() => {
    const last = groupedMessages.at(-1);
    if (isAwaitingBotReply && last && isBotMessageGroup(last)) {
      return groupedMessages.slice(0, -1);
    }
    return groupedMessages;
  }, [groupedMessages, isAwaitingBotReply]);

  const LoadingComponent = componentStore.getComponent(
    'loading' satisfies SafeExtract<LiteralWidgetComponentKey, 'loading'>,
  );

  /* ------------------------------------------------------ */
  /*                      Auto Scroller                     */
  /* ------------------------------------------------------ */
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  function handleNewMessage() {
    setTimeout(() => {
      const container_ = messagesContainerRef.current;
      if (container_) {
        container_.scrollTop = container_.scrollHeight;
      }
    }, 0);
  }

  useEffect(() => {
    handleNewMessage();
  }, [messages]);

  return (
    <div
      {...dc('chat/msgs/root')}
      ref={messagesContainerRef}
      className="max-h-full scroll-smooth relative flex-1 py-2 px-4 flex flex-col gap-2 overflow-auto"
    >
      <ChatCustomStatus />
      <ChatBannerItems />
      <InitialMessages />

      <MessageGroups groups={visibleGroups} />

      {/* Typing indicator while awaiting the (blocking) bot reply. */}
      {isAwaitingBotReply && LoadingComponent && (
        <LoadingComponent agent={bot} />
      )}

      <ChatBottomComponents />
      <SessionResolvedComponent />
    </div>
  );
}
