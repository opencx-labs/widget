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
  /**
   * v5 (agent-bound) only: the message was rendered optimistically and its
   * turn's answer has not started streaming yet — the UI dims the bubble.
   * Cleared by the engine once the turn produces its first chunk (or ends).
   */
  pending?: boolean;
  attachments?: MessageAttachmentType[] | null;
  /**
   * Display names of page elements the visitor attached with the composer's
   * element picker — rendered as context chips on the user bubble. Set
   * optimistically from the send input and re-hydrated from history.
   */
  pickedElements?: Array<{ name: string }>;
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
  /**
   * Agent-v3 (v5 embeds): activity (reasoning/tool calls) that happened
   * before this message within its turn — rendered as a collapsible steps
   * trace above the message, identical for live and historical messages.
   */
  stepsBefore?: Array<{ kind: 'reasoning' | 'tool'; label: string }>;
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
  | WidgetSystemMessage__CsatSubmitted;

/* ------------------------------------------------------ */
/*                          Union                         */
/* ------------------------------------------------------ */
export type WidgetMessageU =
  | WidgetUserMessage
  | WidgetAiMessage
  | WidgetAgentMessage
  | WidgetSystemMessageU;
