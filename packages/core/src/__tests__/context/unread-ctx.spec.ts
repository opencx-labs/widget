// The launcher dot. The backend flags each session row with `unread`; this
// counts those rows and tells the backend when the visitor is looking at one.
import { describe, expect, it, vi } from 'vitest';
import { PrimitiveState } from '../../utils/PrimitiveState';
import { UnreadCtx } from '../../context/unread.ctx';
import type { SessionsState } from '../../context/session.ctx';
import type { SessionDto } from '../../types/dtos';
import type { WidgetConfig } from '../../types/widget-config';

function buildSession(overrides: Partial<SessionDto> = {}): SessionDto {
  return {
    id: 'a3a3a3a3-0000-4000-8000-000000000001',
    ticketNumber: 1,
    title: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isHandedOff: false,
    isOpened: true,
    assignee: { kind: 'ai', name: null, avatarUrl: null },
    channel: 'web',
    isVerified: false,
    lastMessage: 'Hi',
    unread: false,
    modeId: null,
    latestStateCheckpointPayload: null,
    sessionAttributes: {},
    customStatus: null,
    ...overrides,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function buildCtx({
  config: configOverrides = {},
}: { config?: Partial<WidgetConfig> } = {}) {
  const config: WidgetConfig = { token: 'tok', ...configOverrides };
  const sessionsState = new PrimitiveState<SessionsState>({
    data: [],
    cursor: undefined,
    isLastPage: false,
    didStartInitialFetch: false,
    isInitialFetchLoading: true,
  });
  const rowsById = new Map<string, SessionDto>();
  const setRows = (rows: SessionDto[]) => {
    for (const row of rows) rowsById.set(row.id, row);
    sessionsState.setPartial({ data: rows, isInitialFetchLoading: false });
  };
  // The backend answers a read with the session as it should now show.
  const markSessionRead = vi.fn(
    async ({ sessionId }: { sessionId: string }) => {
      const row = rowsById.get(sessionId);
      if (!row) throw new Error(`unknown session ${sessionId}`);
      return { response: new Response(), data: { ...row, unread: false } };
    },
  );
  const setSessions = (rows: SessionDto[]) => {
    const merged = [...rows, ...sessionsState.get().data].filter(
      (s, i, self) => i === self.findIndex((_s) => s.id === _s.id),
    );
    setRows(merged);
  };
  const unreadCtx = new UnreadCtx({
    config,
    api: { markSessionRead },
    sessionsState,
    setSessions,
  });
  return { unreadCtx, setRows, markSessionRead, sessionsState };
}

type ReadAnswer = Awaited<
  ReturnType<ReturnType<typeof buildCtx>['markSessionRead']>
>;

/** Holds one read call open until the test releases it. */
function holdNextRead(
  markSessionRead: ReturnType<typeof buildCtx>['markSessionRead'],
) {
  let release: (answer: ReadAnswer) => void = () => {};
  markSessionRead.mockImplementationOnce(
    () =>
      new Promise<ReadAnswer>((resolve) => {
        release = resolve;
      }),
  );
  return (row: SessionDto) =>
    release({ response: new Response(), data: { ...row, unread: false } });
}

describe('unread sessions', () => {
  it('counts the sessions the backend flags, leaving out the one on screen', () => {
    const { unreadCtx, setRows } = buildCtx();
    const a = buildSession({ id: 'a' });
    const b = buildSession({ id: 'b' });
    setRows([a, b]);
    expect(unreadCtx.state.get()).toEqual({ unreadSessionIds: [], count: 0 });

    setRows([
      { ...a, unread: true },
      { ...b, unread: true },
    ]);
    expect(unreadCtx.state.get()).toEqual({
      unreadSessionIds: ['a', 'b'],
      count: 2,
    });

    unreadCtx.setViewingSessionId('a');
    expect(unreadCtx.state.get()).toEqual({
      unreadSessionIds: ['b'],
      count: 1,
    });
  });

  it('tells the backend when a flagged session is on screen, once per reply, and stops when the visitor leaves', async () => {
    const { unreadCtx, setRows, markSessionRead } = buildCtx();
    const a = buildSession({ id: 'a', unread: true });
    setRows([a]);

    unreadCtx.setViewingSessionId('a');
    await settle();
    expect(markSessionRead).toHaveBeenCalledExactlyOnceWith({ sessionId: 'a' });
    // The returned row replaces the flagged one: the list stops saying unread.
    expect(unreadCtx.state.get().count).toBe(0);

    // The same row polled again is not a new reply.
    setRows([{ ...a, unread: false }]);
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(1);

    // A reply that lands while the visitor is still looking is read too.
    setRows([{ ...a, unread: true, lastMessage: 'Second reply' }]);
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(2);
    expect(unreadCtx.state.get().count).toBe(0);

    unreadCtx.setViewingSessionId(null);
    setRows([{ ...a, unread: true, lastMessage: 'Third reply' }]);
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(2);
    expect(unreadCtx.state.get().unreadSessionIds).toEqual(['a']);
  });

  it('survives a backend that has no read marker yet, and a failed read call', async () => {
    const { unreadCtx, setRows, markSessionRead } = buildCtx();
    const legacy = buildSession({ id: 'legacy' });
    delete legacy.unread;
    setRows([legacy]);
    expect(unreadCtx.state.get().count).toBe(0);

    markSessionRead.mockRejectedValueOnce(new Error('offline'));
    setRows([buildSession({ id: 'a', unread: true })]);
    unreadCtx.setViewingSessionId('a');
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(1);
    // Still flagged by the backend, still on screen: not counted, retried on the next poll.
    expect(unreadCtx.state.get().count).toBe(0);
    setRows([buildSession({ id: 'a', unread: true })]);
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(2);
  });

  it('reports the next session the visitor opens while the previous read is still in flight', async () => {
    const { unreadCtx, setRows, markSessionRead } = buildCtx();
    const a = buildSession({ id: 'a', unread: true });
    const b = buildSession({ id: 'b', unread: true });
    setRows([a, b]);
    const releaseA = holdNextRead(markSessionRead);

    unreadCtx.setViewingSessionId('a');
    unreadCtx.setViewingSessionId('b');
    await settle();
    expect(markSessionRead.mock.calls.map(([args]) => args.sessionId)).toEqual([
      'a',
      'b',
    ]);

    releaseA(a);
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(2);
    expect(unreadCtx.state.get()).toEqual({ unreadSessionIds: [], count: 0 });
  });

  it('retries a failed read after a pause, since a poll returning the same row changes nothing', async () => {
    vi.useFakeTimers();
    try {
      const { unreadCtx, setRows, markSessionRead } = buildCtx();
      const a = buildSession({ id: 'a', unread: true });
      markSessionRead.mockRejectedValueOnce(new Error('offline'));
      setRows([a]);
      unreadCtx.setViewingSessionId('a');
      await vi.advanceTimersByTimeAsync(0);
      expect(markSessionRead).toHaveBeenCalledTimes(1);

      setRows([{ ...a }]);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(markSessionRead).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(markSessionRead).toHaveBeenCalledTimes(2);
      expect(unreadCtx.state.get().count).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a reply polled in during a read over the stale read answer, then reports it too', async () => {
    const { unreadCtx, setRows, markSessionRead, sessionsState } = buildCtx();
    const a = buildSession({
      id: 'a',
      unread: true,
      updatedAt: '2026-10-08T10:00:00.000Z',
      lastMessage: 'First reply',
    });
    setRows([a]);
    const releaseA = holdNextRead(markSessionRead);
    unreadCtx.setViewingSessionId('a');
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(1);

    setRows([
      {
        ...a,
        updatedAt: '2026-10-08T10:00:05.000Z',
        lastMessage: 'Second reply',
      },
    ]);
    releaseA(a);
    await settle();
    expect(sessionsState.get().data[0]?.lastMessage).toBe('Second reply');
    expect(markSessionRead).toHaveBeenCalledTimes(2);
    expect(unreadCtx.state.get().count).toBe(0);
    expect(sessionsState.get().data[0]?.unread).toBe(false);
  });

  it('goes quiet once disposed, even when a read that was in flight fails afterwards', async () => {
    vi.useFakeTimers();
    try {
      const counts: number[] = [];
      const { unreadCtx, setRows, markSessionRead } = buildCtx({
        config: {
          hooks: { onUnreadCountChange: (count) => counts.push(count) },
        },
      });
      const a = buildSession({ id: 'a', unread: true });
      setRows([a]);
      let fail: (reason: Error) => void = () => {};
      markSessionRead.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      );
      unreadCtx.setViewingSessionId('a');
      await vi.advanceTimersByTimeAsync(0);
      expect(markSessionRead).toHaveBeenCalledTimes(1);
      expect(counts).toEqual([1, 0]);

      unreadCtx.dispose();
      fail(new Error('offline'));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(markSessionRead).toHaveBeenCalledTimes(1);
      expect(counts).toEqual([1, 0]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells the host page each time the unread count changes, and survives a hook that throws', () => {
    const counts: number[] = [];
    const { unreadCtx, setRows } = buildCtx({
      config: {
        hooks: {
          onUnreadCountChange: (count) => {
            counts.push(count);
            throw new Error('host bug');
          },
        },
      },
    });
    const a = buildSession({ id: 'a' });
    const b = buildSession({ id: 'b' });
    setRows([a, b]);
    expect(counts).toEqual([0]);

    setRows([{ ...a, unread: true }, b]);
    setRows([{ ...a, unread: true, lastMessage: 'Second reply' }, b]);
    expect(counts).toEqual([0, 1]);

    setRows([
      { ...a, unread: true },
      { ...b, unread: true },
    ]);
    expect(counts).toEqual([0, 1, 2]);
    expect(unreadCtx.state.get().count).toBe(2);
  });
});
