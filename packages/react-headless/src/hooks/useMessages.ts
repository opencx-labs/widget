import { usePrimitiveState } from './usePrimitiveState';
import { useWidget } from '../WidgetProvider';
import { useAgentChatUi } from '../agent-chat/AgentChatContext';

export function useMessages() {
  const { widgetCtx } = useWidget();
  const messagesState = usePrimitiveState(widgetCtx.messageCtx.state);
  const { isStreaming: isAgentStreaming } = useAgentChatUi();
  const effectiveMessagesState =
    widgetCtx.isAgentBound && isAgentStreaming
      ? {
          ...messagesState,
          isSendingMessage: true,
          isSendingMessageToAI: true,
        }
      : messagesState;

  return {
    messagesState: effectiveMessagesState,
    sendMessage: widgetCtx.messageCtx.sendMessage,
    // Composer ↑/↓ recall. Owned by MessageCtx so it is scoped to this widget
    // instance and cleared with the conversation.
    rememberSentText: widgetCtx.messageCtx.rememberSentText,
    getSentTextHistory: widgetCtx.messageCtx.getSentTextHistory,
  };
}
