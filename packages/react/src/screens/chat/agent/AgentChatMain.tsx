import {
  type LiteralWidgetComponentKey,
  type SafeExtract,
} from '@opencx/widget-core';
import { useBot, useConfig, useMessages, useWidget } from '@opencx/widget-react-headless';
import React, { useEffect, useMemo, useRef } from 'react';
import { AgentMessageGroup } from '../../../components/AgentMessageGroup';
import { StreamingTurn } from '../../../components/StreamingTurn';
import { SessionResolvedComponent } from '../../../components/custom-components/SessionResolvedComponent';
import { UserMessageGroup } from '../../../components/UserMessageGroup';
import { ChatBottomComponents } from '../../../components/custom-components/ChatBottomComponents';
import { dc } from '../../../utils/data-component';
import {
  groupMessagesByType,
  isAgentMessageGroup,
  isBotMessageGroup,
  isUserMessageGroup,
} from '../../../utils/group-messages-by-type';
import { AdvancedInitialMessages } from '../AdvancedInitialMessages';
import { ChatBannerItems } from '../ChatBannerItems';
import { InitialMessages } from '../InitialMessages';
import { useAgentChatUi } from './AgentChatContext';

/**
 * The agent-v3 (v5) message list. Renders the persisted transcript (history +
 * polling — so human-agent handoff replies appear) exactly like the stock
 * `ChatMain`, then overlays the IN-FLIGHT assistant turn from useChat below it.
 * The turn's busy state comes from useChat `status` (via `useAgentChatUi`), not
 * the old three-flag machine, so it can never desync.
 */
export function AgentChatMain() {
  const {
    messagesState: { messages },
  } = useMessages();
  const { isStreaming, liveItems } = useAgentChatUi();
  const { componentStore } = useWidget();
  const { humanAgent } = useConfig();
  // Server-resolved agent branding wins over the local `bot` option.
  const bot = useBot();

  const groupedMessages = useMemo(() => groupMessagesByType(messages), [messages]);

  const LoadingComponent = componentStore.getComponent(
    'loading' satisfies SafeExtract<LiteralWidgetComponentKey, 'loading'>,
  );

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTimeout(() => {
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    }, 0);
  }, [messages, liveItems]);

  return (
    <div
      {...dc('chat/msgs/root')}
      ref={messagesContainerRef}
      className="max-h-full scroll-smooth relative flex-1 py-2 px-4 flex flex-col gap-2 overflow-auto"
    >
      <ChatBannerItems />
      <AdvancedInitialMessages />
      <InitialMessages />

      {groupedMessages.map((group) => {
        const type = group?.[0]?.type;
        const firstIdInGroup = group[0]?.id;
        if (!type || !firstIdInGroup) return null;

        if (isUserMessageGroup(group)) {
          return <UserMessageGroup key={firstIdInGroup} messages={group} />;
        }

        if (isBotMessageGroup(group)) {
          return (
            <AgentMessageGroup
              key={firstIdInGroup}
              messages={group}
              agent={bot ? { ...bot, isAi: true, id: null } : undefined}
            />
          );
        }

        if (isAgentMessageGroup(group)) {
          const agent = group[0]?.agent;
          return (
            <AgentMessageGroup
              key={firstIdInGroup}
              messages={group}
              agent={
                agent
                  ? {
                      ...agent,
                      name: humanAgent?.name || agent.name || '',
                      avatarUrl: humanAgent?.avatarUrl || agent.avatarUrl || null,
                    }
                  : humanAgent
                    ? {
                        isAi: false,
                        id: null,
                        name: humanAgent.name || '',
                        avatarUrl: humanAgent.avatarUrl || null,
                      }
                    : undefined
              }
            />
          );
        }

        return null;
      })}

      {/* The live in-flight turn, streamed from useChat. */}
      {isStreaming && liveItems.length > 0 && (
        <StreamingTurn
          turn={{ active: true, items: liveItems }}
          agent={bot ? { ...bot, isAi: true, id: null } : undefined}
        />
      )}
      {/* Typing indicator until the stream's FIRST visible item arrives — a
          silent early stream must never look like a dead widget. */}
      {isStreaming && liveItems.length === 0 && LoadingComponent && (
        <LoadingComponent agent={bot} />
      )}

      <ChatBottomComponents />
      <SessionResolvedComponent />
    </div>
  );
}
