import {
  DictationSession,
  type DictationMint,
} from '../../dictation/dictation-session';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const mint: DictationMint = {
  token: 'synthetic',
  expiresAt: '2099-01-01T00:00:00Z',
  model: 'fixture',
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function microphone() {
  const stop = vi.fn();
  const track = { stop };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  return { stop, stream };
}

for (const permissionFirst of [true, false]) {
  test(`stops the microphone when mint fails (permission first: ${permissionFirst})`, async () => {
    const { stop, stream } = microphone();
    const permission = deferred<MediaStream>();
    const token = deferred<DictationMint>();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => permission.promise },
    });
    const onError = vi.fn();
    const session = new DictationSession({
      mintToken: () => token.promise,
      onDelta: vi.fn(),
      onState: vi.fn(),
      onError,
    });
    const started = session.start();
    if (permissionFirst) {
      permission.resolve(stream);
      await vi.advanceTimersByTimeAsync(0);
    }
    token.reject(new Error('Synthetic mint failure'));
    await started;
    if (!permissionFirst) {
      permission.resolve(stream);
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(onError).toHaveBeenCalledWith('unavailable');
    expect(stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
}

test('stopping during SDP creation closes the mic and does not start a handshake later', async () => {
  const { stop, stream } = microphone();
  const offer = deferred<RTCSessionDescriptionInit>();
  const close = vi.fn();
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => stream },
  });
  vi.stubGlobal(
    'RTCPeerConnection',
    class {
      addTrack() {}
      addEventListener() {}
      createDataChannel() {
        return { addEventListener() {}, close };
      }
      createOffer() {
        return offer.promise;
      }
      async setLocalDescription() {}
      close = close;
    },
  );
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const session = new DictationSession({
    mintToken: async () => mint,
    onDelta: vi.fn(),
    onState: vi.fn(),
    onError: vi.fn(),
  });
  const started = session.start();
  await vi.advanceTimersByTimeAsync(0);
  session.stop();
  offer.resolve({ type: 'offer', sdp: 'synthetic-offer' });
  await started;
  expect(stop).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
