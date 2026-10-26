import type { SessionDto } from '../types/dtos';
import type {
  WidgetAgentMessage,
  WidgetAiMessage,
  WidgetMessageU,
} from '../types/messages';

/**
 * Agent and AI messages are the ones that can carry options: a teammate's
 * macro arrives as AGENT, a workflow's (e.g. its send-macro action) as AI.
 */
export function isAgentOrAiMessage(
  message: WidgetMessageU,
): message is WidgetAgentMessage | WidgetAiMessage {
  return message.type === 'AGENT' || message.type === 'AI';
}

/**
 * The message whose options the visitor can tap now: the newest agent or AI
 * message that carries options, while none of them is picked and the session
 * is not closed. Older options are spent, even if nobody tapped them.
 */
export function tappableOptionsMessage(
  messages: readonly WidgetMessageU[],
  session: Pick<SessionDto, 'isOpened'> | null,
): WidgetAgentMessage | WidgetAiMessage | null {
  if (session?.isOpened === false) return null;
  const newest = messages.findLast(
    (message): message is WidgetAgentMessage | WidgetAiMessage =>
      isAgentOrAiMessage(message) && !!message.messageOptions,
  );
  return newest?.messageOptions?.pickedOptionId === null ? newest : null;
}

/**
 * The visitor must answer the tappable options by tapping, so the composer is
 * locked: they require a tap and no agent or AI message has arrived after
 * them. A tap (picked at once, on acceptance), a closed session or a newer
 * agent or AI message releases it. Options without `requireTap` never lock.
 */
export function isAwaitingRequiredTap(
  messages: readonly WidgetMessageU[],
  session: Pick<SessionDto, 'isOpened'> | null,
): boolean {
  const tappable = tappableOptionsMessage(messages, session);
  if (tappable?.messageOptions?.requireTap !== true) return false;
  return messages.findLast(isAgentOrAiMessage)?.id === tappable.id;
}
