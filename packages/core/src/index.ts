export type { Agent } from './types/agent';
export type { SafeExtract, SafeOmit, StringOrLiteral } from './types/helpers';
export type {
  LiteralWidgetComponentKey,
  MarkedElementRef,
  WidgetComponentKey,
  WidgetUserMessage,
  WidgetAgentMessage,
  WidgetAiMessage,
  WidgetSystemMessage__StateCheckpoint,
  WidgetSystemMessage__CsatRequested,
  WidgetSystemMessage__CsatSubmitted,
  WidgetSystemMessageU,
  WidgetMessageU,
} from './types/messages';
export type {
  MessageAttachmentType,
  MessageDto,
  SendMessageDto,
  SendMessageOutputDto,
  ResolveSessionDto,
  SessionDto,
  VoteInputDto,
  VoteOutputDto,
  ActionCallDto,
  ModeDto,
  AgentTurnMessagesDto,
} from './types/dtos';
export type {
  WidgetConfig,
  WidgetDisplayModeU,
  WidgetCompanionLayoutU,
  WidgetCompanionDefaultLayoutU,
  WidgetSidebarSideU,
  WidgetSidebarModeU,
  HeaderButtonU,
  ComponentContext,
  ModeComponent,
  ModeComponentProps,
  CustomComponent,
  CustomComponentProps,
  WidgetUiAction,
  WidgetContext,
  WidgetMention,
  WidgetMentionsOptions,
  WidgetPageContext,
} from './types/widget-config';
export type { ExternalStorage } from './types/external-storage';
export type { OpenCxComponentNameU } from './types/component-name';
export type { IconNameU } from './types/icons';
export {
  isAgentStreamKeepalive,
  isTurnSteeredPart,
} from './api/agent-stream-parts';

export { WidgetCtx, WidgetInitializationError } from './context/widget.ctx';
export { resolveClientPresentation } from './context/resolve-client-presentation';
export type { WidgetAgent, WidgetClientFeatures } from './context/widget-agent';
export type { ContactCtx } from './context/contact.ctx';
export type { SessionCtx } from './context/session.ctx';
export type {
  MessageCtx,
  SendMessageInput,
  StagedUserTurn,
} from './context/message.ctx';
export {
  buildSendMessageBody,
  resolveConfigContext,
} from './context/message.ctx';
export type { RouterCtx, ScreenU } from './context/router.ctx';
export type { CsatCtx } from './context/csat.ctx';
export type {
  DictationCtx,
  DictationCtxState,
  DictationStatus,
  DictationTarget,
} from './context/dictation.ctx';
export type { DictationErrorCode } from './dictation/dictation-session';
export { DictationLevelSmoother } from './dictation/dictation-level-smoother';

export { PrimitiveState } from './utils/PrimitiveState';
export { genUuid } from './utils/uuid';
export { log } from './utils/log';
export { isRecord } from './utils/is-record';
export {
  normalizeCompanionLayouts,
  resolveCompanionDefaultLayout,
  resolveSidebarMode,
  resolveSidebarSide,
} from './utils/companion-layout';
export type { WidgetSidebarSideResolvedU } from './utils/companion-layout';
export { isExhaustive } from './utils/is-exhaustive';

export {
  type Language,
  type TranslationInterface,
  type TranslationKeyU,
  getTranslation,
  isRtlLanguage,
  isSupportedLanguage,
  resolveLanguage,
  translate,
} from './translation';

export type { FileWithProgress } from './context/upload.ctx';
