import type { ApiCaller } from '../api/api-caller';
import type { Dto } from '../api/client';
import type {
  WidgetSystemMessage__CsatRequestCancelled,
  WidgetSystemMessage__CsatSubmitted,
} from '../types/messages';
import type { WidgetConfig } from '../types/widget-config';
import { genUuid } from '../utils/uuid';
import type { MessageCtx } from './message.ctx';
import type { SessionCtx } from './session.ctx';

export class CsatCtx {
  private config: WidgetConfig;
  private api: ApiCaller;
  private sessionCtx: SessionCtx;
  private messageCtx: MessageCtx;

  constructor({
    config,
    api,
    sessionCtx,
    messageCtx,
  }: {
    config: WidgetConfig;
    api: ApiCaller;
    sessionCtx: SessionCtx;
    messageCtx: MessageCtx;
  }) {
    this.config = config;
    this.api = api;
    this.sessionCtx = sessionCtx;
    this.messageCtx = messageCtx;
  }

  /**
   * Optimistic: the `csat_submitted` event is shown before the API answers and
   * carries the uuid the server will store, so the poll dedupes it. A refusal
   * (or a failed call) rolls it back — the score was never recorded, so the
   * picker must not stay locked on it.
   */
  submitCsat = async (
    body: Pick<Dto['WidgetSubmitCsatInputDto'], 'score' | 'feedback'>,
  ) => {
    const currentSessionId = this.sessionCtx.sessionState.get().session?.id;
    if (!currentSessionId) {
      return { data: null, error: 'No session id found' };
    }

    const optimistic: WidgetSystemMessage__CsatSubmitted = {
      id: genUuid(),
      type: 'SYSTEM',
      subtype: 'csat_submitted',
      timestamp: new Date().toISOString(),
      data: {
        payload: {
          score: body.score,
          feedback: body.feedback,
        },
      },
    };
    this.appendMessage(optimistic);
    const answeredRequestId = this.latestRequestId();

    const { data, error } = await this.api.submitCsat({
      ...body,
      system_message_uuid: optimistic.id,
      session_id: currentSessionId,
    });

    if (!data?.success) {
      this.removeMessage(optimistic.id);
      // Echo the cancel only if no newer request landed while the call was in flight.
      if (
        data?.reason === 'request_cancelled' &&
        this.latestRequestId() === answeredRequestId
      ) {
        this.appendMessage(this.localCancellation());
      }
    }
    return { data, error };
  };

  private latestRequestId = () =>
    this.messageCtx.state
      .get()
      .messages.findLast(
        (message) =>
          message.type === 'SYSTEM' && message.subtype === 'csat_requested',
      )?.id;

  private localCancellation = (): WidgetSystemMessage__CsatRequestCancelled => ({
    id: genUuid(),
    type: 'SYSTEM',
    subtype: 'csat_request_cancelled',
    timestamp: new Date().toISOString(),
    data: { payload: undefined },
  });

  private appendMessage = (
    message:
      | WidgetSystemMessage__CsatSubmitted
      | WidgetSystemMessage__CsatRequestCancelled,
  ) => {
    this.messageCtx.state.setPartial({
      messages: [...this.messageCtx.state.get().messages, message],
    });
  };

  private removeMessage = (id: string) => {
    this.messageCtx.state.setPartial({
      messages: this.messageCtx.state
        .get()
        .messages.filter((message) => message.id !== id),
    });
  };
}
