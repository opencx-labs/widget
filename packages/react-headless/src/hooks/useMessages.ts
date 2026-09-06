import { usePrimitiveState } from './usePrimitiveState';
import { useWidget } from '../WidgetProvider';
import { useAgentChatUi } from '../agent-chat/AgentChatContext';

export function useMessages() {
  const { widgetCtx } = useWidget();
  const messagesState = usePrimitiveState(widgetCtx.messageCtx.state);
  // While a streamed reply is in flight the classic "awaiting reply" flags
  // read true too, so every consumer sees one notion of "the AI is replying".
  const { isStreaming } = useAgentChatUi();
  const effectiveMessagesState = isStreaming
    ? { ...messagesState, isSendingMessage: true, isSendingMessageToAI: true }
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
