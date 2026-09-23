import { useConfig, useMessages } from '@opencx/widget-react-headless';

/** Share the first-message requirement between the composer and its launcher. */
export function useInitialQuestionRequired() {
  const { requireInitialQuestion, initialQuestions } = useConfig();
  const { messagesState } = useMessages();

  return (
    requireInitialQuestion === true &&
    messagesState.messages.length === 0 &&
    initialQuestions?.some((question) => question.trim().length > 0) === true
  );
}
