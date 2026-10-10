import { useCallback } from 'react';
import { useWidget } from '../WidgetProvider';
import { usePrimitiveState } from './usePrimitiveState';

/**
 * Sessions holding a reply the visitor has not looked at yet, as flagged by
 * the backend. Counts sessions, not messages. A session clears when its chat
 * is on screen — see `useUnreadViewing`, which a shell must mount for that.
 */
export function useUnread() {
  const { widgetCtx } = useWidget();
  const { unreadSessionIds, count } = usePrimitiveState(
    widgetCtx.unreadCtx.state,
  );
  const isUnread = useCallback(
    (sessionId: string) => unreadSessionIds.includes(sessionId),
    [unreadSessionIds],
  );
  return { count, hasUnread: count > 0, unreadSessionIds, isUnread };
}
