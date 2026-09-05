import '../../api-caller.mock';

import { ApiCaller } from '../../../api/api-caller';
import { WidgetCtx } from '../../../context/widget.ctx';
import type { MessageDto, SessionDto } from '../../../types/dtos';
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

const systemHistoryItem = (
  payload: MessageDto['systemMessagePayload'],
  type: MessageDto['type'],
): MessageDto => ({
  publicId: genUuid(),
  type,
  content: { text: null },
  sentAt: new Date().toISOString(),
  attachments: null,
  actionCalls: null,
  sender: { kind: 'system', name: null, avatar: null },
  systemMessagePayload: payload,
});

const requestedItem = () =>
  systemHistoryItem({ type: 'csat_requested', payload: null }, 'csat_requested');
const cancelledItem = () =>
  systemHistoryItem(
    { type: 'csat_request_cancelled', payload: null },
    'csat_request_cancelled',
  );

const openSessionWithHistory = async (history: MessageDto[]) => {
  const session = makeSessionDto();
  TestUtils.mock.ApiCaller.pollSessionAndHistory(ApiCaller, {
    data: { session, history },
  });
  const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });
  widgetCtx.sessionCtx.sessionState.setPartial({ session });
  await TestUtils.sleep(50);
  return widgetCtx;
};

suite('csat_request_cancelled arriving through the session poll', () => {
  it('maps to a SYSTEM message the survey state can fold over', async () => {
    const widgetCtx = await openSessionWithHistory([requestedItem(), cancelledItem()]);

    const messages = widgetCtx.messageCtx.state.get().messages;
    expect(messages.map((m) => (m.type === 'SYSTEM' ? m.subtype : m.type))).toEqual([
      'csat_requested',
      'csat_request_cancelled',
    ]);
    expect(deriveCsatState(messages)).toMatchObject({
      isCsatRequested: false,
      isCsatCancelled: true,
    });
  });

  it('positive control: the same poll without the cancel leaves the picker live', async () => {
    const widgetCtx = await openSessionWithHistory([requestedItem()]);

    expect(deriveCsatState(widgetCtx.messageCtx.state.get().messages)).toMatchObject({
      isCsatRequested: true,
      isCsatCancelled: false,
    });
  });
});
