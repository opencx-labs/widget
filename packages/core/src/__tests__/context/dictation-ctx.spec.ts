import '../api-caller.mock';

import { ApiCaller } from '../../api/api-caller';
import { DictationCtx } from '../../context/dictation.ctx';
import { WidgetCtx } from '../../context/widget.ctx';
import { TestUtils } from '../test-utils';
import { DictationSession } from '../../dictation/dictation-session';

/**
 * DictationCtx drives one DictationSession per widget and lands transcript
 * deltas in the composer: text follows whatever the visitor typed, spoken
 * commands ("send it", "scratch that") act on it, and a manual edit inside
 * the dictated region ends the session. The session itself (mic + WebRTC)
 * is stubbed at its class boundary — everything above it is real.
 */

type Handlers = {
  onDelta: (delta: string) => void;
  onState: (state: 'connecting' | 'listening' | 'stopped' | 'error') => void;
  onError: (code: 'microphone' | 'unavailable') => void;
};

const captured: { handlers: Handlers | null; stops: number } = {
  handlers: null,
  stops: 0,
};

vi.mock('../../dictation/dictation-session', () => ({
  DictationSession: class {
    constructor(handlers: Handlers) {
      captured.handlers = handlers;
    }
    async start() {
      captured.handlers?.onState('connecting');
      captured.handlers?.onState('listening');
    }
    stop() {
      captured.stops += 1;
    }
  },
}));

function composer(initial = '') {
  let value = initial;
  const onSend = vi.fn();
  return {
    target: {
      getValue: () => value,
      setValue: (next: string) => {
        value = next;
      },
      onSend,
    },
    read: () => value,
    onSend,
  };
}

function makeCtx() {
  const config = { token: '', language: 'en' } as const;
  return new DictationCtx({ api: new ApiCaller({ config }), config });
}

async function flushDrip(ms = 2_000) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  captured.handlers = null;
  captured.stops = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

suite('DictationCtx', () => {
  test('is exported behind the stubbed session boundary', () => {
    expect(DictationSession).toBeDefined();
  });

  test("deltas drip into the composer after the visitor's existing text", async () => {
    const ctx = makeCtx();
    const c = composer('Hi ');
    ctx.start(c.target);
    await flushDrip(0);
    expect(ctx.state.get().status).toBe('listening');

    captured.handlers?.onDelta('there');
    captured.handlers?.onDelta(' friend.');
    await flushDrip();
    expect(c.read()).toBe('Hi there friend.');
  });

  test('"send it" as its own sentence sends and ends the session', async () => {
    const ctx = makeCtx();
    const c = composer();
    ctx.start(c.target);
    await flushDrip(0);

    captured.handlers?.onDelta('Order status please.');
    captured.handlers?.onDelta(' Send it.');
    await flushDrip();

    // The separator space stays (the composer trims on send), the command is gone.
    expect(c.read()).toBe('Order status please. ');
    expect(c.onSend).toHaveBeenCalledTimes(1);
    expect(ctx.state.get().status).toBe('idle');
    expect(ctx.isActive()).toBe(false);
    expect(captured.stops).toBe(1);
  });

  test('a pending command phrase resolves after a silent pause', async () => {
    const ctx = makeCtx();
    const c = composer();
    ctx.start(c.target);
    await flushDrip(0);

    captured.handlers?.onDelta('Hello.');
    captured.handlers?.onDelta(' Send it');
    await flushDrip(1_400);

    expect(c.onSend).toHaveBeenCalledTimes(1);
    expect(c.read()).toBe('Hello. ');
  });

  test('stop() flushes the withheld tail as literal words', async () => {
    const ctx = makeCtx();
    const c = composer();
    ctx.start(c.target);
    await flushDrip(0);

    captured.handlers?.onDelta('Please send');
    ctx.stop();
    expect(c.read()).toBe('Please send');
    expect(c.onSend).not.toHaveBeenCalled();
    expect(ctx.state.get()).toEqual({ status: 'idle', error: null });
  });

  test('a manual edit inside the dictated region ends the session', async () => {
    const ctx = makeCtx();
    const c = composer();
    ctx.start(c.target);
    await flushDrip(0);

    captured.handlers?.onDelta('One two');
    await flushDrip();
    expect(c.read()).toBe('One two');
    c.target.setValue('One two three (typed)');

    captured.handlers?.onDelta(' four');
    await flushDrip();
    expect(c.read()).toBe('One two three (typed)');
    expect(ctx.isActive()).toBe(false);
  });

  test('a session error surfaces its code and never fires send', async () => {
    const ctx = makeCtx();
    const c = composer();
    ctx.start(c.target);
    await flushDrip(0);

    // A pending "send it" (no terminator yet) must NOT fire on an error
    // teardown: the command phrase resolves (stopping is the pause) but its
    // control is dropped — nothing is sent.
    captured.handlers?.onDelta('Hello.');
    captured.handlers?.onDelta(' Send it');
    captured.handlers?.onError('microphone');
    await flushDrip();

    expect(ctx.state.get()).toEqual({ status: 'idle', error: 'microphone' });
    expect(c.read()).toBe('Hello. ');
    expect(c.onSend).not.toHaveBeenCalled();
  });

  test('the session ending itself (max duration) is mirrored to idle', async () => {
    const ctx = makeCtx();
    ctx.start(composer().target);
    await flushDrip(0);
    captured.handlers?.onState('stopped');
    expect(ctx.state.get().status).toBe('idle');
    expect(ctx.isActive()).toBe(false);
  });

  test('starting again replaces the live session', async () => {
    const ctx = makeCtx();
    ctx.start(composer().target);
    await flushDrip(0);
    ctx.start(composer('x').target);
    await flushDrip(0);
    expect(captured.stops).toBe(1);
    expect(ctx.isActive()).toBe(true);
  });
});

suite('WidgetCtx.features.dictation (server-enabled, embed-narrowed)', () => {
  function serverConfig(dictation: boolean) {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 60,
        sessionPollingIntervalSeconds: 10,
        modes: [],
        agent: {
          name: 'Agent',
          avatar_url: null,
          streaming: true,
          features: TestUtils.agentFeatures({ dictation }),
        },
      },
    });
  }

  test('org on, embed silent → on', async () => {
    serverConfig(true);
    const ctx = await WidgetCtx.initialize({ config: { token: '' } });
    expect(ctx.features.dictation).toBe(true);
    expect(ctx.dictationCtx.state.get().status).toBe('idle');
  });

  test('org on, embed features.dictation=false → off (narrowing)', async () => {
    serverConfig(true);
    const ctx = await WidgetCtx.initialize({
      config: { token: '', features: { dictation: false } },
    });
    expect(ctx.features.dictation).toBe(false);
  });

  test('org off, embed features.dictation=true → still off (never widens)', async () => {
    serverConfig(false);
    const ctx = await WidgetCtx.initialize({
      config: { token: '', features: { dictation: true } },
    });
    expect(ctx.features.dictation).toBe(false);
  });
});
