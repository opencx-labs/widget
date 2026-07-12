export type { Agent } from './types/agent';
export type { SafeExtract, SafeOmit, StringOrLiteral } from './types/helpers';
export type {
  LiteralWidgetComponentKey,
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
} from './types/dtos';
export {
  WIDGET_DISPLAY_MODES,
  WIDGET_COMPANION_LAYOUTS,
  WIDGET_COMPANION_DEFAULT_LAYOUTS,
} from './types/widget-config';
export type {
  WidgetConfig,
  WidgetDisplayModeU,
  WidgetCompanionLayoutU,
  WidgetCompanionDefaultLayoutU,
  HeaderButtonU,
  ComponentContext,
  ModeComponent,
  ModeComponentProps,
  CustomComponent,
  CustomComponentProps,
} from './types/widget-config';
export type { ExternalStorage } from './types/external-storage';
export type { OpenCxComponentNameU } from './types/component-name';
export type { IconNameU } from './types/icons';

export { WidgetCtx } from './context/widget.ctx';
export type { ContactCtx } from './context/contact.ctx';
export type { SessionCtx } from './context/session.ctx';
export type { MessageCtx } from './context/message.ctx';
export type { RouterCtx, ScreenU } from './context/router.ctx';
export type { CsatCtx } from './context/csat.ctx';

export { PrimitiveState } from './utils/PrimitiveState';
export { isExhaustive } from './utils/is-exhaustive';

export {
  type Language,
  type TranslationInterface,
  type TranslationKeyU,
  getTranslation,
  isSupportedLanguage,
} from './translation';
