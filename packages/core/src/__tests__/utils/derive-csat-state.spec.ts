import type {
  WidgetMessageU,
  WidgetSystemMessageU,
} from '../../types/messages';
import { deriveCsatState } from '../../utils/derive-csat-state';
import { genUuid } from '../../utils/uuid';

const requested = (): WidgetSystemMessageU => ({
  id: genUuid(),
  type: 'SYSTEM',
  subtype: 'csat_requested',
  timestamp: null,
  data: { payload: undefined },
});
const cancelled = (): WidgetSystemMessageU => ({
  id: genUuid(),
  type: 'SYSTEM',
  subtype: 'csat_request_cancelled',
  timestamp: null,
  data: { payload: undefined },
});
const submitted = (score = 4, feedback = 'ok'): WidgetSystemMessageU => ({
  id: genUuid(),
  type: 'SYSTEM',
  subtype: 'csat_submitted',
  timestamp: null,
  data: { payload: { score, feedback } },
});
const userMessage = (): WidgetMessageU => ({
  id: genUuid(),
  type: 'USER',
  content: 'hi',
  deliveredAt: null,
  timestamp: null,
});

suite(deriveCsatState.name, () => {
  it('no CSAT events → nothing is live', () => {
    const state = deriveCsatState([userMessage()]);
    expect(state).toMatchObject({
      isCsatRequested: false,
      isCsatSubmitted: false,
      isCsatCancelled: false,
    });
  });

  it('requested → the picker is live', () => {
    const state = deriveCsatState([userMessage(), requested()]);
    expect(state).toMatchObject({
      isCsatRequested: true,
      isCsatSubmitted: false,
      isCsatCancelled: false,
    });
    expect(state.csatRequestedMessage?.subtype).toBe('csat_requested');
  });

  it('requested then cancelled → voided, picker retired', () => {
    const state = deriveCsatState([requested(), cancelled()]);
    expect(state).toMatchObject({
      isCsatRequested: false,
      isCsatSubmitted: false,
      isCsatCancelled: true,
    });
  });

  it('cancelled then re-requested → the newer request revives the picker', () => {
    const state = deriveCsatState([requested(), cancelled(), requested()]);
    expect(state).toMatchObject({
      isCsatRequested: true,
      isCsatCancelled: false,
    });
  });

  it('a stray cancel with no request behind it is still not a live picker', () => {
    const state = deriveCsatState([cancelled()]);
    expect(state).toMatchObject({
      isCsatRequested: false,
      isCsatCancelled: true,
    });
  });

  it('submitted wins over a later cancel — an answered survey never un-submits', () => {
    const state = deriveCsatState([requested(), submitted(5, 'great'), cancelled()]);
    expect(state).toMatchObject({
      isCsatRequested: false,
      isCsatSubmitted: true,
      isCsatCancelled: false,
      submittedScore: 5,
      submittedFeedback: 'great',
    });
  });

  it('submitted wins over an earlier cancel too', () => {
    const state = deriveCsatState([requested(), cancelled(), submitted(2)]);
    expect(state).toMatchObject({
      isCsatSubmitted: true,
      isCsatCancelled: false,
      submittedScore: 2,
    });
  });

  it('the latest submission is the one shown', () => {
    const state = deriveCsatState([requested(), submitted(1, 'first'), submitted(3, 'second')]);
    expect(state).toMatchObject({ submittedScore: 3, submittedFeedback: 'second' });
  });
});
