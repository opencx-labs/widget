import { useMessages } from './useMessages';
import { useSessions } from './useSessions';

export function useIsAwaitingBotReply() {
  const { sessionState } = useSessions();
  const { messagesState } = useMessages();

  const isSessionAssignedToAI = sessionState.session?.assignee.kind === 'ai';
  // This check is useful in cases where the user might navigate in and out of a chat, and `isSendingMessage` is reset back to its default value
  const isLastMessageAUserMessage =
    messagesState.messages?.at(-1)?.type === 'USER';

  const isAwaitingBotReply = (() => {
    if (messagesState.isSendingMessageToAI) return true;
    if (
      (isSessionAssignedToAI || sessionState.isCreatingSession) &&
      (messagesState.isSendingMessage || isLastMessageAUserMessage)
    ) {
      return true;
    }
    return false;
  })();

  return {
    isAwaitingBotReply,
  };
}
