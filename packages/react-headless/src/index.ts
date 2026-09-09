export type {
  WidgetComponentType,
  WidgetComponentProps,
} from './types/components';

export { WidgetProvider, useWidget } from './WidgetProvider';
export { useAgentChatUi } from './agent-chat/AgentChatContext';
export { applyPresentation } from './agent-chat/apply-presentation';
export type {
  SpecDataPart,
  StreamingStep,
  StreamingTurnState,
  StreamingTurnItem,
} from './agent-chat/agent-chat-stream';
export type { TurnRenderSource } from './agent-chat/agent-turn-sources';
export { formatAskQuestionsAnswers } from './agent-chat/ask-questions';
export type { AskQuestionsRequest } from './agent-chat/ask-questions';

export { useBot } from './hooks/useBot';
export { useConfig } from './hooks/useConfig';
export { useDisplayMode } from './hooks/useDisplayMode';
export { useContact } from './hooks/useContact';
export { useDocumentDir } from './hooks/useDocumentDir';
export {
  HOST_CONTEXT_CHANGED_EVENT,
  useHostLocation,
} from './hooks/useHostLocation';
export { useIsAwaitingBotReply } from './hooks/useIsAwaitingBotReply';
export { useMessages } from './hooks/useMessages';
export { usePrimitiveState } from './hooks/usePrimitiveState';
export { useSessions } from './hooks/useSessions';
export { useWidgetRouter } from './hooks/useWidgetRouter';
export { type FileWithProgress, useUploadFiles } from './hooks/useUploadFiles';
export {
  useWidgetTrigger,
  WidgetTriggerProvider,
} from './hooks/useWidgetTrigger';
export { useWidgetLayout, WidgetLayoutProvider } from './hooks/useWidgetLayout';
export { useModes } from './hooks/useModes';
export { useCsat } from './hooks/useCsat';
export { useDictation } from './hooks/useDictation';

export { useCompanionChats } from './ConversationWorkspace';

export { useComposerDraft } from './hooks/useComposerDraft';

export type { ConnectionRequest } from './agent-chat/agent-chat-stream';
export { useConnection } from './agent-chat/useConnection';
