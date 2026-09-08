import { useMemo } from 'react';
import { useConversationWorkspace } from '../ConversationWorkspace';
import { useWidget } from '../WidgetProvider';
import { usePrimitiveState } from './usePrimitiveState';
import { useConfig } from './useConfig';

export function useSessions() {
  const { widgetCtx } = useWidget();
  const { oneOpenSessionAllowed } = useConfig();
  const sessionState = usePrimitiveState(widgetCtx.sessionCtx.sessionState);
  const sessionsState = usePrimitiveState(widgetCtx.sessionCtx.sessionsState);

  const { openSessions, closedSessions } = useMemo(() => {
    return {
      openSessions: sessionsState.data.filter((s) => s.isOpened === true),
      closedSessions: sessionsState.data.filter((s) => s.isOpened === false),
    };
  }, [sessionsState.data]);

  const { workspace } = useConversationWorkspace();
  const canCreateNewSession = workspace
    ? workspace.canCreateChat()
    : !oneOpenSessionAllowed ||
      (openSessions.length === 0 &&
        !sessionState.isCreatingSession &&
        !sessionState.session?.isOpened);

  return {
    sessionState,
    sessionsState,
    loadMoreSessions: widgetCtx.sessionCtx.loadMoreSessions,
    resolveSession: widgetCtx.sessionCtx.resolveSession,
    createStateCheckpoint: widgetCtx.sessionCtx.createStateCheckpoint,
    openSessions,
    closedSessions,
    canCreateNewSession,
  };
}
