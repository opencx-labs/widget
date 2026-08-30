import {
  type LiteralWidgetComponentKey,
  type SafeExtract,
  type WidgetMessageU,
} from '@opencx/widget-core';
import {
  type TurnRenderSource,
  useAgentChatUi,
  useBot,
  useMessages,
  useWidget,
} from '@opencx/widget-react-headless';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import React, { useMemo } from 'react';
import { StreamingTurn } from '../../../components/StreamingTurn';
import { SessionResolvedComponent } from '../../../components/custom-components/SessionResolvedComponent';
import { ChatBottomComponents } from '../../../components/custom-components/ChatBottomComponents';
import { useTranslation } from '../../../hooks/useTranslation';
import { dc } from '../../../utils/data-component';
import {
  groupMessagesByType,
  isUserMessageGroup,
} from '../../../utils/group-messages-by-type';
import { ChatBannerItems } from '../ChatBannerItems';
import { ChatCustomStatus } from '../ChatCustomStatus';
import { InitialMessages } from '../InitialMessages';
import { MessageGroups } from '../MessageGroups';
import { useStreamFollow } from './useStreamFollow';

/**
 * The agent-chat message list, rendered as ONE keyed sequence so a turn's
 * node keeps its React identity through every phase of its life:
 *
 * - Rows covered by a turn render source (`turnSources`) render through the
 *   streaming renderer (`StreamingTurn`) at their transcript position — the
 *   retained live message for a turn that just finished (no swap, no flash,
 *   chips stay) and the server's persisted `ui_parts` for historical turns
 *   (reload fidelity). Their plain bubbles are suppressed.
 * - Uncovered rows render exactly as before (shared `MessageGroups` rule).
 * - The IN-FLIGHT turn renders last, under the same key its retained source
 *   will use — the live→retained promotion moves data, never the node.
 */
export function AgentChatMain() {
  const {
    messagesState: { messages },
  } = useMessages();
  const {
    isStreaming,
    liveItems,
    turnSources,
    liveTurnKey,
    turnFailed,
    onRetryFailedTurn,
  } = useAgentChatUi();
  const { componentStore } = useWidget();
  const { t } = useTranslation();
  // Server-resolved agent branding wins over the local `bot` option.
  const bot = useBot();
  const botAgent = useMemo(
    () => (bot ? { ...bot, isAi: true, id: null } : undefined),
    [bot],
  );

  const groupedMessages = useMemo(
    () => groupMessagesByType(messages),
    [messages],
  );

  const sourceByRowId = useMemo(() => {
    const map = new Map<string, TurnRenderSource>();
    for (const source of turnSources) {
      for (const rowId of source.rowIds) map.set(rowId, source);
    }
    return map;
  }, [turnSources]);

  // While the overlay has content it is the SOLE renderer of the current turn:
  // the turn's rows land in the polled transcript mid-stream and must not
  // render a second copy above it. Everything assistant-side after the LAST
  // user group that is not already covered by a finished turn's source is the
  // current turn's region.
  const lastUserGroupIndex = useMemo(() => {
    for (let i = groupedMessages.length - 1; i >= 0; i -= 1) {
      const group = groupedMessages[i];
      if (group && isUserMessageGroup(group)) return i;
    }
    return -1;
  }, [groupedMessages]);

  // A boolean, not the array: `liveItems` gets a fresh identity on every
  // throttled stream tick, and this memo only cares whether the overlay owns
  // the trailing region — depending on the array would rebuild every finished
  // turn's node ~20×/sec for the whole reply.
  const hasLiveItems = liveItems.length > 0;

  const { nodes: transcriptNodes, renderedSourceKeys } = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    const renderedSourceKeys = new Set<string>();
    groupedMessages.forEach((group, groupIndex) => {
      const firstIdInGroup = group[0]?.id;
      if (!firstIdInGroup) return;
      if (isUserMessageGroup(group)) {
        nodes.push(<MessageGroups key={firstIdInGroup} groups={[group]} />);
        return;
      }
      // Assistant-side group: rows covered by a turn source render through
      // that source's StreamingTurn (once per source); uncovered rows keep
      // the stock rendering, in runs so grouping visuals survive.
      let run: WidgetMessageU[] = [];
      const flushRun = () => {
        const runFirstId = run[0]?.id;
        if (runFirstId) {
          nodes.push(<MessageGroups key={runFirstId} groups={[run]} />);
        }
        run = [];
      };
      for (const message of group) {
        const source = sourceByRowId.get(message.id);
        if (source) {
          flushRun();
          if (!renderedSourceKeys.has(source.key)) {
            renderedSourceKeys.add(source.key);
            nodes.push(
              <StreamingTurn
                key={source.key}
                turn={{ active: false, items: source.items }}
                agent={botAgent}
                timestamp={message.timestamp}
              />,
            );
          }
        } else if (hasLiveItems && groupIndex > lastUserGroupIndex) {
          // The live overlay owns this region — suppress the plain copy.
        } else {
          run.push(message);
        }
      }
      flushRun();
    });
    return { nodes, renderedSourceKeys };
  }, [
    groupedMessages,
    sourceByRowId,
    hasLiveItems,
    lastUserGroupIndex,
    botAgent,
  ]);

  // One owner per node key: a finished turn is retained into `turnSources` at
  // the stream boundary, BEFORE its rows land — the overlay keeps rendering
  // it until then. The commit where the rows arrive renders the source, so
  // the overlay must stand down in that same commit (the release effect only
  // flips state afterwards).
  const liveTurnNodeKey = liveTurnKey;
  const showLiveTurn =
    liveItems.length > 0 && !renderedSourceKeys.has(liveTurnNodeKey);

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
        <ChatCustomStatus />
        <ChatBannerItems />
        <InitialMessages />

        {[
          ...transcriptNodes,
          /* The live turn, streamed from useChat. Rendered in the SAME keyed
            sequence as the finished turns so its promotion to a retained
            source (same key) is a data move, never an unmount — the reply
            and its tool chips never blink. `active` follows the real stream,
            so shimmers and in-progress steps settle the moment it ends. */
          ...(showLiveTurn
            ? [
                <StreamingTurn
                  key={liveTurnNodeKey}
                  turn={{ active: isStreaming, items: liveItems }}
                  agent={botAgent}
                />,
              ]
            : []),
        ]}
        {/* Typing indicator until the stream's FIRST visible item arrives — a
          silent early stream must never look like a dead widget. */}
        {isStreaming && liveItems.length === 0 && LoadingComponent && (
          <LoadingComponent agent={bot} />
        )}
        {/* A failed turn must be VISIBLE: without this row the user sees a
          dimmed bubble and silence forever. Retry re-sends the same message
          under a fresh wire uuid through the normal queue. */}
        {turnFailed && !isStreaming && (
          <div
            {...dc('chat/turn_failed/root')}
            className="flex items-center gap-2 self-start rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <span>{t('turn_failed_message')}</span>
            <button
              {...dc('chat/turn_failed/retry')}
              type="button"
              onClick={onRetryFailedTurn}
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              {t('turn_failed_retry')}
            </button>
          </div>
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
            aria-label={t('scroll_to_bottom')}
            className="absolute bottom-3 left-1/2 z-20 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-lg transition-colors hover:text-foreground"
          >
            <ArrowDown className="size-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
