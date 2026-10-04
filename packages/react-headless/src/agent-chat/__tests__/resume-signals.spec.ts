import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToResumeSignals } from '../resume-signals';

/**
 * The browser moments that resume a dropped stream, and the hosts that have
 * none: React Native has no `document`, and its `window` (the global object)
 * has no `addEventListener`. Subscribing there used to throw on mount and
 * take the whole streaming engine down with it.
 */

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('subscribeToResumeSignals in a browser', () => {
  it('fires when the tab becomes visible and when the network returns', () => {
    const onSignal = vi.fn();
    const unsubscribe = subscribeToResumeSignals(onSignal);

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));

    expect(onSignal).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('stays quiet while the tab is hidden, then fires once it is visible', () => {
    const onSignal = vi.fn();
    const unsubscribe = subscribeToResumeSignals(onSignal);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(onSignal).not.toHaveBeenCalled();

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onSignal).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('stops firing after unsubscribe', () => {
    const onSignal = vi.fn();
    const unsubscribe = subscribeToResumeSignals(onSignal);
    window.dispatchEvent(new Event('online'));
    expect(onSignal).toHaveBeenCalledOnce();

    unsubscribe();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(onSignal).toHaveBeenCalledOnce();
  });
});

describe('subscribeToResumeSignals without a DOM', () => {
  it('React Native globals: no document, window without listeners → no-op, no throw', () => {
    const realWindow = window;
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('window', {});
    const onSignal = vi.fn();

    const unsubscribe = subscribeToResumeSignals(onSignal);
    expect(() => unsubscribe()).not.toThrow();

    // Nothing was registered on the real window behind the stub.
    realWindow.dispatchEvent(new Event('online'));
    expect(onSignal).not.toHaveBeenCalled();
  });

  it('no document alone → no-op, no throw', () => {
    const realWindow = window;
    vi.stubGlobal('document', undefined);
    const onSignal = vi.fn();

    const unsubscribe = subscribeToResumeSignals(onSignal);
    expect(() => unsubscribe()).not.toThrow();

    realWindow.dispatchEvent(new Event('online'));
    expect(onSignal).not.toHaveBeenCalled();
  });
});
