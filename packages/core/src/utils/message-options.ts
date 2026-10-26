import type { SessionDto } from '../types/dtos';
import type { WidgetAgentMessage, WidgetMessageU } from '../types/messages';

/**
 * The agent message whose options the visitor can tap now: the newest AGENT
 * message that carries options, while none of them is picked and the session
 * is not closed. Older options are spent, even if nobody tapped them.
 */
export function tappableOptionsMessage(
  messages: readonly WidgetMessageU[],
  session: Pick<SessionDto, 'isOpened'> | null,
): WidgetAgentMessage | null {
  if (session?.isOpened === false) return null;
  const newest = messages.findLast(
    (message): message is WidgetAgentMessage =>
      message.type === 'AGENT' && !!message.messageOptions,
  );
  return newest?.messageOptions?.pickedOptionId === null ? newest : null;
}

/**
 * The visitor must answer the tappable options by tapping, so the composer is
 * locked: they require a tap and no agent message has arrived after them. A
 * tap (picked at once, on acceptance), a closed session or a newer agent
 * message releases it. Options without `requireTap` never lock.
 */
export function isAwaitingRequiredTap(
  messages: readonly WidgetMessageU[],
  session: Pick<SessionDto, 'isOpened'> | null,
): boolean {
  const tappable = tappableOptionsMessage(messages, session);
  if (tappable?.messageOptions?.requireTap !== true) return false;
  const newestAgent = messages.findLast((message) => message.type === 'AGENT');
  return newestAgent?.id === tappable.id;
}
