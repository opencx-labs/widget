import {
  type LiteralWidgetComponentKey,
  type SafeExtract,
} from '@opencx/widget-core';
import {
  useBot,
  useConfig,
  useMessages,
  useWidget,
} from '@opencx/widget-react-headless';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import React, { useMemo } from 'react';
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
import { useStreamFollow } from './use-stream-follow';

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

  const groupedMessages = useMemo(
    () => groupMessagesByType(messages),
    [messages],
  );

  // Whenever the overlay has content, `StreamingTurn` (below) is the SOLE
  // renderer of the current assistant turn. The persisted store polls the
  // canonical rows continuously ("history + polling"), so the turn's rows can
  // land in `messages` while the overlay is still up and render a SECOND copy
  // above it. Hide the trailing assistant-side groups (everything after the
  // last user message — i.e. the current turn) for as long as the overlay owns
  // that region.
  //
  // This tracks `liveItems`, NOT `isStreaming`: the overlay outlives the stream
  // by the post-turn handoff (see `settling` in `useAgentChat`), and both sides
  // must switch on the same signal so the swap is a single commit — one owner
  // at all times, never zero (a blank flash) and never two (a duplicate).
  const visibleGroups = useMemo(() => {
    if (liveItems.length === 0) return groupedMessages;
    let end = groupedMessages.length;
    while (end > 0) {
      const group = groupedMessages[end - 1];
      if (group && isUserMessageGroup(group)) break;
      end -= 1;
    }
    return groupedMessages.slice(0, end);
  }, [groupedMessages, liveItems]);

  const LoadingComponent = componentStore.getComponent(
    'loading' satisfies SafeExtract<LiteralWidgetComponentKey, 'loading'>,
  );

  // Companion-parity streaming scroll: follow the bottom only while pinned;
  // once the user scrolls up, release and surface the scroll-to-bottom button.
  const { containerRef, handleScroll, showScrollDown, scrollToBottom } =
    useStreamFollow([messages, liveItems]);

  return (
    <div
      {...dc('chat/msgs/wrapper')}
      className="relative flex flex-1 flex-col min-h-0"
    >
      <div
        {...dc('chat/msgs/root')}
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-full relative flex-1 py-2 px-4 flex flex-col gap-2 overflow-auto"
      >
        <ChatBannerItems />
        <AdvancedInitialMessages />
        <InitialMessages />

        {visibleGroups.map((group) => {
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
                        avatarUrl:
                          humanAgent?.avatarUrl || agent.avatarUrl || null,
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

        {/* The live turn, streamed from useChat. Stays mounted through the
          post-stream handoff so the reply never blinks out while its canonical
          rows are fetched. `active` follows the real stream, so shimmers and
          in-progress steps settle the moment it ends. */}
        {liveItems.length > 0 && (
          <StreamingTurn
            turn={{ active: isStreaming, items: liveItems }}
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

      <AnimatePresence>
        {showScrollDown && (
          <motion.button
            {...dc('chat/msgs/scroll-to-bottom')}
            key="scroll-to-bottom"
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            className="absolute bottom-3 left-1/2 z-20 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-black/10 bg-background text-muted-foreground shadow-lg transition-colors hover:text-foreground dark:border-white/10"
          >
            <ArrowDown className="size-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
