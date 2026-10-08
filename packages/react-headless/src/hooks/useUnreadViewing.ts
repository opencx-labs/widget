import { useEffect, useSyncExternalStore } from 'react';
import { useWidget } from '../WidgetProvider';
import { usePrimitiveState } from './usePrimitiveState';
import { useWidgetRouter } from './useWidgetRouter';
import { useWidgetTrigger } from './useWidgetTrigger';

const subscribeToVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};
const isDocumentVisible = () => document.visibilityState !== 'hidden';

/**
 * Tells the widget which session the visitor is actually looking at: widget
 * open, chat screen with its transcript loaded and showing, tab visible. The
 * backend clears that session's unread flag. Mount once per shell inside
 * `WidgetTriggerProvider`; without it, nothing ever reads as seen. A shell
 * that can stay open while hiding the transcript (the companion's input bar)
 * passes `transcriptVisible`.
 */
export function useUnreadViewing({
  transcriptVisible = true,
}: { transcriptVisible?: boolean } = {}) {
  const { widgetCtx } = useWidget();
  const { isOpen } = useWidgetTrigger();
  const { routerState } = useWidgetRouter();
  const { session } = usePrimitiveState(widgetCtx.sessionCtx.sessionState);
  const { isInitialFetchLoading } = usePrimitiveState(
    widgetCtx.messageCtx.state,
  );
  const visible = useSyncExternalStore(
    subscribeToVisibility,
    isDocumentVisible,
    () => true,
  );

  const viewingSessionId =
    isOpen &&
    visible &&
    transcriptVisible &&
    routerState.screen === 'chat' &&
    !isInitialFetchLoading
      ? (session?.id ?? null)
      : null;

  useEffect(() => {
    widgetCtx.unreadCtx.setViewingSessionId(viewingSessionId);
  }, [widgetCtx, viewingSessionId]);

  useEffect(
    () => () => widgetCtx.unreadCtx.setViewingSessionId(null),
    [widgetCtx],
  );
}
