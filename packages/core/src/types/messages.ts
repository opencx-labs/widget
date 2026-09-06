import type { MessageAttachmentType } from './dtos';
import type { SafeExtract, StringOrLiteral } from './helpers';
import type { Agent } from './agent';
import type { WidgetMention } from './widget-config';

/* ------------------------------------------------------ */
/*                 Component-related types                */
/* ------------------------------------------------------ */
export type LiteralWidgetComponentKey =
  | 'bot_message'
  | 'agent_message'
  | 'agent_chat_steps'
  | 'agent_chat_spec'
  | 'agent_chat_questions'
  | 'loading'
  | 'fallback';
export type WidgetComponentKey = StringOrLiteral<LiteralWidgetComponentKey>;

/* ------------------------------------------------------ */
/*                      Message types                     */
/* ------------------------------------------------------ */
/**
 * One page mark as the user bubble shows it. `mark` is the very object the
 * composer put in `clientContext.page_marks` — passing the REFERENCE through
 * (rather than a copy or an id) is what lets the UI layer find the mark's
 * thumbnail again, which is keyed by object identity and deliberately never
 * serialized into the send payload.
 */
export type MarkedElementRef = {
  /** Display name of the element the mark was placed on. */
  name: string;
  /** The visitor's note, when they wrote one. */
  note?: string;
  /** The originating page-mark object, when the send carried one. */
  mark?: object;
  /** The marked region's uploaded image — what a reload shows instead of the name. */
  snapshotUrl?: string;
};

export type WidgetUserMessage = {
  id: string;
  type: 'USER';
  content: string;
  /**
   * Streaming engine only: the message was rendered optimistically and its
   * turn's answer has not started streaming yet — the UI dims the bubble.
   * Cleared by the engine once the turn produces its first chunk (or ends).
   */
  pending?: boolean;
  attachments?: MessageAttachmentType[] | null;
  /**
   * The host-page marks the visitor sent with this message — rendered as
   * context chips on the user bubble. Set optimistically from the send input
   * and re-hydrated from history.
   */
  markedElements?: MarkedElementRef[];
  /**
   * What the visitor @-mentioned in this message. The bubble highlights each
   * one where its `@Title` sits in `content`.
   */
  mentions?: WidgetMention[];
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
