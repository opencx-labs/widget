import '../../api-caller.mock';

import { ApiCaller } from '../../../api/api-caller';
import { WidgetCtx } from '../../../context/widget.ctx';
import type { SessionDto } from '../../../types/dtos';
import type { WidgetSystemMessageU } from '../../../types/messages';
import { deriveCsatState } from '../../../utils/derive-csat-state';
import { genUuid } from '../../../utils/uuid';
import { TestUtils } from '../../test-utils';

const makeSessionDto = (overrides: Partial<SessionDto> = {}): SessionDto => ({
  id: genUuid(),
  ticketNumber: 1,
  title: null,
  assignee: { kind: 'ai', name: null, avatarUrl: null },
  channel: '',
  createdAt: new Date().toISOString(),
  isHandedOff: false,
  isOpened: false,
  isVerified: false,
  lastMessage: '',
  updatedAt: new Date().toISOString(),
  modeId: null,
  latestStateCheckpointPayload: null,
  sessionAttributes: {},
  customStatus: null,
  ...overrides,
});

const csatRequested = (): WidgetSystemMessageU => ({
  id: genUuid(),
  type: 'SYSTEM',
  subtype: 'csat_requested',
  timestamp: new Date(0).toISOString(),
  data: { payload: undefined },
});

/**
 * A widget on a closed session whose survey is live: the request is already
 * in state, and the poller returns nothing so the only state changes come
 * from `submitCsat` itself.
 */
const widgetWithLiveSurvey = async () => {
  const session = makeSessionDto();
  TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
    data: { session, history: [] },
  });
  const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });
  widgetCtx.sessionCtx.sessionState.setPartial({ session });
  widgetCtx.messageCtx.state.setPartial({ messages: [csatRequested()] });
  await TestUtils.sleep(30);
  return widgetCtx;
};

const subtypes = (widgetCtx: WidgetCtx) =>
  widgetCtx.messageCtx.state
    .get()
    .messages.flatMap((m) => (m.type === 'SYSTEM' ? [m.subtype] : []));

suite('CsatCtx.submitCsat', () => {
  it('accepted → the optimistic submission stays and the survey reads as submitted', async () => {
    TestUtils.mock.ApiCaller.submitCsat(ApiCaller, { data: { success: true } });
    const widgetCtx = await widgetWithLiveSurvey();

    const { data } = await widgetCtx.csatCtx.submitCsat({ score: 4, feedback: 'nice' });

    expect(data).toEqual({ success: true });
    expect(subtypes(widgetCtx)).toEqual(['csat_requested', 'csat_submitted']);
    expect(deriveCsatState(widgetCtx.messageCtx.state.get().messages)).toMatchObject({
      isCsatSubmitted: true,
      submittedScore: 4,
      submittedFeedback: 'nice',
    });
  });

  it('sends the optimistic message id so the poll can dedupe the server copy', async () => {
    TestUtils.mock.ApiCaller.submitCsat(ApiCaller, { data: { success: true } });
    const widgetCtx = await widgetWithLiveSurvey();

    await widgetCtx.csatCtx.submitCsat({ score: 4 });

    const submitted = widgetCtx.messageCtx.state
      .get()
      .messages.find((m) => m.type === 'SYSTEM' && m.subtype === 'csat_submitted');
    expect(submitted).toBeDefined();
    expect(ApiCaller.prototype.submitCsat).toHaveBeenLastCalledWith(
      expect.objectContaining({ system_message_uuid: submitted?.id, score: 4 }),
    );
  });

  it('refused as request_cancelled → rolls the submission back and retires the picker', async () => {
    TestUtils.mock.ApiCaller.submitCsat(ApiCaller, {
      data: { success: false, reason: 'request_cancelled' },
    });
    const widgetCtx = await widgetWithLiveSurvey();

    const { data } = await widgetCtx.csatCtx.submitCsat({ score: 2 });

    expect(data).toEqual({ success: false, reason: 'request_cancelled' });
    expect(subtypes(widgetCtx)).toEqual(['csat_requested', 'csat_request_cancelled']);
    expect(deriveCsatState(widgetCtx.messageCtx.state.get().messages)).toMatchObject({
      isCsatRequested: false,
      isCsatSubmitted: false,
      isCsatCancelled: true,
    });
  });

  it('refused as request_cancelled, but a newer request landed mid-flight → no echo, new survey stays live', async () => {
    let resolveSubmit: (value: {
      response: Response;
      data: { success: false; reason: 'request_cancelled' };
    }) => void = () => {};
    vi.mocked(ApiCaller.prototype.submitCsat).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const widgetCtx = await widgetWithLiveSurvey();

    const inFlight = widgetCtx.csatCtx.submitCsat({ score: 2 });
    // The poll delivers the old request's cancel and a brand-new request
    // while the submit is still awaiting its (refusing) response.
    const oldCancel: WidgetSystemMessageU = {
      id: genUuid(),
      type: 'SYSTEM',
      subtype: 'csat_request_cancelled',
      timestamp: new Date().toISOString(),
      data: { payload: undefined },
    };
    widgetCtx.messageCtx.state.setPartial({
      messages: [...widgetCtx.messageCtx.state.get().messages, oldCancel, csatRequested()],
    });
    resolveSubmit({
      response: new Response(),
      data: { success: false, reason: 'request_cancelled' },
    });
    await inFlight;

    expect(subtypes(widgetCtx)).toEqual([
      'csat_requested',
      'csat_request_cancelled',
      'csat_requested',
    ]);
    expect(deriveCsatState(widgetCtx.messageCtx.state.get().messages)).toMatchObject({
      isCsatRequested: true,
      isCsatCancelled: false,
    });
  });

  it('refused as rescore_locked → rolls the submission back, survey stays as it was', async () => {
    TestUtils.mock.ApiCaller.submitCsat(ApiCaller, {
      data: { success: false, reason: 'rescore_locked' },
    });
    const widgetCtx = await widgetWithLiveSurvey();

    await widgetCtx.csatCtx.submitCsat({ score: 2 });

    expect(subtypes(widgetCtx)).toEqual(['csat_requested']);
    expect(deriveCsatState(widgetCtx.messageCtx.state.get().messages)).toMatchObject({
      isCsatRequested: true,
      isCsatCancelled: false,
    });
  });

  it('a plain failure (no reason) → rolls the submission back so the customer can retry', async () => {
    TestUtils.mock.ApiCaller.submitCsat(ApiCaller, { data: { success: false } });
    const widgetCtx = await widgetWithLiveSurvey();

    await widgetCtx.csatCtx.submitCsat({ score: 2 });

    expect(subtypes(widgetCtx)).toEqual(['csat_requested']);
  });

  it('without a session → no call, no state change', async () => {
    TestUtils.mock.ApiCaller.submitCsat(ApiCaller, { data: { success: true } });
    const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });
    vi.mocked(ApiCaller.prototype.submitCsat).mockClear();

    const result = await widgetCtx.csatCtx.submitCsat({ score: 5 });

    expect(result).toEqual({ data: null, error: 'No session id found' });
    expect(ApiCaller.prototype.submitCsat).not.toHaveBeenCalled();
    expect(widgetCtx.messageCtx.state.get().messages).toEqual([]);
  });
});
