import type { MessageAttachmentType, MessageDto } from './dtos';
import type { SafeExtract, StringOrLiteral } from './helpers';
import type { Agent } from './agent';

/* ------------------------------------------------------ */
/*                 Component-related types                */
/* ------------------------------------------------------ */
export type LiteralWidgetComponentKey =
  | 'bot_message'
  | 'agent_message'
  | 'loading'
  | 'fallback';
export type WidgetComponentKey = StringOrLiteral<LiteralWidgetComponentKey>;

/* ------------------------------------------------------ */
/*                      Message types                     */
/* ------------------------------------------------------ */
export type WidgetUserMessage = {
  id: string;
  type: 'USER';
  content: string;
  deliveredAt: string | null;
  attachments?: MessageAttachmentType[] | null;
  timestamp: string | null;
  user?: {
    name?: string;
    email?: string;
    phone?: string;
    customData?: Record<string, string>;
    avatarUrl?: string;
  };
};

export type WidgetAiMessage<TActionData = unknown> = {
  id: string;
  type: 'AI';
  /**
   * The type is a bot_message literal string or other strings that correspond to the UI responses from AI action calls
   */
  component: StringOrLiteral<SafeExtract<WidgetComponentKey, 'bot_message'>>;
  data: {
    message: string;
    variant?: 'default' | 'error';
    action?: {
      name: string;
      data: TActionData;
    } | null;
  };
  timestamp: string | null;
  agent?: Agent;
  attachments?: MessageAttachmentType[];
};

export type WidgetAgentMessage = {
  id: string;
  type: 'AGENT';
  component: SafeExtract<LiteralWidgetComponentKey, 'agent_message'>;
  data: {
    message: string;
    variant?: 'default' | 'error';
    action?: undefined;
  };
  timestamp: string | null;
  agent?: Agent;
  attachments?: MessageAttachmentType[];
};

export type WidgetSystemMessage__StateCheckpoint = {
  id: string;
  type: 'SYSTEM';
  subtype: 'state_checkpoint';
  timestamp: string | null;
  attachments?: undefined;
  data: {
    payload: unknown;
  };
};
export type WidgetSystemMessage__CsatRequested = {
  id: string;
  type: 'SYSTEM';
  subtype: 'csat_requested';
  timestamp: string | null;
  attachments?: undefined;
  data: {
    payload?: undefined;
  };
};
/**
 * The survey was voided before it was answered (a newer session superseded it).
 * The latest of `csat_requested` / `csat_request_cancelled` decides whether the
 * picker is live — see `deriveCsatState`.
 */
export type WidgetSystemMessage__CsatRequestCancelled = {
  id: string;
  type: 'SYSTEM';
  subtype: 'csat_request_cancelled';
  timestamp: string | null;
  attachments?: undefined;
  data: {
    payload?: undefined;
  };
};
export type WidgetSystemMessage__CsatSubmitted = {
  id: string;
  type: 'SYSTEM';
  subtype: 'csat_submitted';
  timestamp: string | null;
  attachments?: undefined;
  data: {
    payload: {
      score: number | null | undefined;
      feedback: string | null | undefined;
    };
  };
};
export type WidgetSystemMessageU =
  | WidgetSystemMessage__StateCheckpoint
  | WidgetSystemMessage__CsatRequested
  | WidgetSystemMessage__CsatRequestCancelled
  | WidgetSystemMessage__CsatSubmitted;

/* ------------------------------------------------------ */
/*                          Union                         */
/* ------------------------------------------------------ */
export type WidgetMessageU =
  | WidgetUserMessage
  | WidgetAiMessage
  | WidgetAgentMessage
  | WidgetSystemMessageU;
