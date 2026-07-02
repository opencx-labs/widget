import type { Dto } from '../api/client';

export type VoteInputDto = Dto['WidgetVoteDto'];
export type VoteOutputDto = Dto['WidgetVoteResponseDto'];

export type SendMessageDto = Dto['WidgetSendMessageInputDto'];
export type SendMessageOutputDto = Dto['WidgetSendMessageOutputDto'];

export type ResolveSessionDto = Dto['WidgetResolveSessionInputDto'];

export type CreateSessionDto = NonNullable<Dto['CreateWidgetSessionDto']>;

export type SessionDto = Dto['WidgetSessionDto'];
export type MessageDto = Dto['WidgetHistoryDto'];
export type MessageAttachmentType = NonNullable<
  Dto['WidgetHistoryDto']['attachments']
>[number];

export type ActionCallDto = NonNullable<
  Dto['WidgetHistoryDto']['actionCalls']
>[number];

export type ModeDto = Dto['WidgetConfigDto']['modes'][number];
