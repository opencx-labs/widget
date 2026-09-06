import '../api-caller.mock';

import { describe, expect, it, vi } from 'vitest';
import { WidgetCtx } from '../../context/widget.ctx';
import { genUuid } from '../../utils/uuid';

/**
 * `reconcileAfterStream` ingests the rows the backend persisted for a turn
 * that just finished streaming. It must be CANCELLABLE: a reconcile still in
 * flight when the visitor starts a new chat (or switches sessions) would
 * otherwise land afterwards and append the old conversation's rows to the
 * fresh transcript. The signal it passes has to be one somebody can fire.
 */
describe('reconcileAfterStream cancellation', () => {
  const init = () => WidgetCtx.initialize({ config: { token: '' } });

  const openSession = (widgetCtx: WidgetCtx, id: string) =>
    widgetCtx.sessionCtx.sessionState.setPartial({
      session: {
        id,
        ticketNumber: 1,
        title: null,
        assignee: { kind: 'ai', name: null, avatarUrl: null },
        channel: '',
        createdAt: new Date().toISOString(),
        isHandedOff: false,
        isOpened: true,
        isVerified: false,
        lastMessage: '',
      } as never,
    });

  /**
   * Hold every poll open so the reconcile is genuinely in flight. Signals are
   * collected in order: the session poller ticks against the same method, so
   * tests must pick out the one call the reconcile itself made rather than
   * "the last signal seen".
   */
  const holdPollsOpen = (widgetCtx: WidgetCtx) => {
    const signals: AbortSignal[] = [];
    vi.mocked(widgetCtx.api.pollSessionAndHistory).mockImplementation((({
      abortSignal,
    }: {
      abortSignal: AbortSignal;
    }) => {
      signals.push(abortSignal);
      return new Promise(() => {});
    }) as never);
    return signals;
  };

  /**
   * Start a reconcile and return the signal IT passed. `reconcileAfterStream`
   * reaches the fetch synchronously, so the next recorded signal is its own.
   */
  const startReconcile = (
    widgetCtx: WidgetCtx,
    signals: AbortSignal[],
    sessionId: string,
  ) => {
    const before = signals.length;
    void widgetCtx.reconcileAfterStream(sessionId);
    const signal = signals[before];
    if (!signal) throw new Error('reconcile did not reach the fetch');
    return signal;
  };

  it('passes a signal that is live, not a pre-detached one', async () => {
    const widgetCtx = await init();
    const sessionId = genUuid();
    openSession(widgetCtx, sessionId);
    const signals = holdPollsOpen(widgetCtx);

    const signal = startReconcile(widgetCtx, signals, sessionId);

    expect(signal.aborted).toBe(false);
  });

  it('aborts the in-flight reconcile when the conversation resets', async () => {
    const widgetCtx = await init();
    const sessionId = genUuid();
    openSession(widgetCtx, sessionId);
    const signals = holdPollsOpen(widgetCtx);

    const signal = startReconcile(widgetCtx, signals, sessionId);
    expect(signal.aborted).toBe(false);

    widgetCtx.resetChat();

    expect(signal.aborted).toBe(true);
  });

  it('aborts the in-flight reconcile when the visitor switches session', async () => {
    const widgetCtx = await init();
    const firstSession = genUuid();
    openSession(widgetCtx, firstSession);
    const signals = holdPollsOpen(widgetCtx);

    const signal = startReconcile(widgetCtx, signals, firstSession);

    openSession(widgetCtx, genUuid());

    expect(signal.aborted).toBe(true);
  });

  it('leaves the reconcile alone while its own session stays active', async () => {
    const widgetCtx = await init();
    const sessionId = genUuid();
    openSession(widgetCtx, sessionId);
    const signals = holdPollsOpen(widgetCtx);

    const signal = startReconcile(widgetCtx, signals, sessionId);

    // An unrelated update to the SAME session (e.g. a title landing) must not
    // cancel the reconcile.
    openSession(widgetCtx, sessionId);

    expect(signal.aborted).toBe(false);
  });
});
