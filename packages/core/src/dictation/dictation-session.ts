import { isRecord } from '../utils/is-record';
import { log } from '../utils/log';
/**
 * One live dictation session: microphone → WebRTC → realtime transcription.
 * The browser talks to the transcription service directly with a short-lived
 * ephemeral token minted by the backend — audio and transcripts never touch
 * OpenCX servers, and the real API key never reaches the browser.
 *
 * WebRTC (not WebSocket) because the browser stack handles Opus encoding,
 * jitter buffering and echo cancellation natively — no PCM plumbing, lowest
 * practical latency.
 *
 * Errors are CODES (the widget renders them through its translation table).
 */

export type DictationSessionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'stopped'
  | 'error';

export type DictationErrorCode =
  /** No getUserMedia, permission denied, or no device. */
  | 'microphone'
  /** Mint, handshake, or transport failure. */
  | 'unavailable';

export interface DictationMint {
  token: string;
  expiresAt: string;
  model: string;
}

type ServerEvent = {
  type: string;
  delta: string | undefined;
  errorMessage: string | undefined;
};

/** The three fields dictation reads off a realtime server event. */
function parseServerEvent(value: unknown): ServerEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  const error = isRecord(value.error) ? value.error : null;
  return {
    type: value.type,
    delta: typeof value.delta === 'string' ? value.delta : undefined,
    errorMessage:
      error && typeof error.message === 'string' ? error.message : undefined,
  };
}

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

/** Hard cap so an abandoned tab never leaves the mic streaming forever. */
const MAX_SESSION_MS = 10 * 60 * 1000;
/** If the session isn't live shortly after starting (mint + mic + handshake
 * all included), bail out — never leave a mic open on a hung connect. */
const CONNECT_TIMEOUT_MS = 15_000;
/** How long a transient WebRTC 'disconnected' may last before giving up. */
const DISCONNECT_GRACE_MS = 5_000;

class DictationMicrophoneError extends Error {}

export class DictationSession {
  private readonly mintToken: () => Promise<DictationMint>;
  private readonly onDelta: (delta: string) => void;
  private readonly onState: (state: DictationSessionState) => void;
  private readonly onError: (code: DictationErrorCode) => void;
  private readonly onLevel: ((level: number) => void) | undefined;

  private state: DictationSessionState = 'idle';
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private levelRaf = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private loggedParseFailure = false;

  constructor({
    mintToken,
    onDelta,
    onState,
    onError,
    onLevel,
  }: {
    mintToken: () => Promise<DictationMint>;
    onDelta: (delta: string) => void;
    onState: (state: DictationSessionState) => void;
    onError: (code: DictationErrorCode) => void;
    onLevel?: (level: number) => void;
  }) {
    this.mintToken = mintToken;
    this.onDelta = onDelta;
    this.onState = onState;
    this.onError = onError;
    this.onLevel = onLevel;
  }

  async start() {
    if (this.state !== 'idle') return;
    this.setState('connecting');

    // Watchdogs arm IMMEDIATELY — mint, permission prompt, or the SDP fetch
    // can all hang, and none of them may leave the mic open forever.
    this.timers.push(
      setTimeout(() => {
        if (this.state === 'connecting') this.fail('unavailable');
      }, CONNECT_TIMEOUT_MS),
    );
    this.timers.push(setTimeout(() => this.stop(), MAX_SESSION_MS));

    try {
      // Mic first — the permission prompt is the slowest step; mint in parallel.
      // If mint rejects while the permission prompt is still open, the
      // eventually-resolved stream must not stay hot: drain it on arrival.
      const micPromise = this.requestMicrophone();
      void micPromise
        .then((stream) => {
          if (this.isTornDown() || (this.stream && this.stream !== stream)) {
            stream.getTracks().forEach((t) => t.stop());
          }
        })
        .catch(() => undefined); // surfaced via the await below
      const [stream, mint] = await Promise.all([micPromise, this.mintToken()]);
      if (this.isTornDown()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.startLevelMeter(stream);

      const pc = new RTCPeerConnection();
      this.pc = pc;
      const [track] = stream.getAudioTracks();
      if (!track) throw new DictationMicrophoneError('No audio track');
      pc.addTrack(track, stream);

      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.addEventListener('message', (event) =>
        this.handleServerEvent(event.data),
      );
      // The mic track is already flowing once the connection is up — don't
      // make the user wait for the first server event to start speaking.
      dc.addEventListener('open', () => {
        if (this.state === 'connecting') this.setState('listening');
      });

      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed') {
          this.fail('unavailable');
          return;
        }
        // 'disconnected' is transient and routinely self-recovers — only give
        // up if it doesn't come back within a grace period.
        if (pc.connectionState === 'disconnected') {
          this.timers.push(
            setTimeout(() => {
              if (this.pc === pc && pc.connectionState !== 'connected') {
                this.fail('unavailable');
              }
            }, DISCONNECT_GRACE_MS),
          );
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(REALTIME_CALLS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mint.token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });
      if (!sdpResponse.ok) {
        throw new Error(`Realtime handshake failed (${sdpResponse.status})`);
      }
      const answerSdp = await sdpResponse.text();
      if (this.isTornDown()) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      if (e instanceof DictationMicrophoneError) {
        this.fail('microphone');
      } else {
        log.error('dictation session failed to start', {
          _e: e instanceof Error ? e.message : String(e),
        });
        this.fail('unavailable');
      }
    }
  }

  stop() {
    if (this.state === 'stopped') return;
    this.teardown();
    this.setState('stopped');
  }

  private async requestMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DictationMicrophoneError('Microphone is not supported');
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      throw new DictationMicrophoneError(
        e instanceof DOMException ? e.name : 'Could not access the microphone',
      );
    }
  }

  private handleServerEvent(raw: unknown) {
    if (typeof raw !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (!this.loggedParseFailure) {
        this.loggedParseFailure = true;
        log.error('dictation server event was not valid JSON', {
          snippet: raw.slice(0, 120),
        });
      }
      return;
    }
    const event = parseServerEvent(parsed);
    if (!event) return;

    const { type, delta } = event;
    if (
      type === 'session.created' ||
      type === 'transcription_session.created'
    ) {
      this.setState('listening');
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.delta' && delta) {
      // First delta can arrive before we noticed session.created.
      if (this.state === 'connecting') this.setState('listening');
      this.onDelta(delta);
      return;
    }
    if (type === 'error') {
      log.error('dictation server event error', {
        _e: event.errorMessage ?? 'unknown',
      });
      this.fail('unavailable');
    }
  }

  private startLevelMeter(stream: MediaStream) {
    if (!this.onLevel) return;
    try {
      const audioContext = new AudioContext();
      this.audioContext = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const centered = ((data[i] ?? 128) - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length);
        this.onLevel?.(Math.min(1, rms * 4));
        this.levelRaf = requestAnimationFrame(tick);
      };
      this.levelRaf = requestAnimationFrame(tick);
    } catch (e) {
      // Level meter is decorative — dictation works without it.
      log.error('dictation level meter unavailable', {
        _e: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private isTornDown() {
    return this.state === 'stopped' || this.state === 'error';
  }

  private fail(code: DictationErrorCode) {
    if (this.isTornDown()) return;
    this.teardown();
    this.setState('error');
    this.onError(code);
  }

  private teardown() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    if (this.levelRaf) cancelAnimationFrame(this.levelRaf);
    this.levelRaf = 0;
    this.dc?.close();
    this.dc = null;
    this.pc?.close();
    this.pc = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.audioContext?.close().catch((e) => {
      log.error('failed to close dictation audio context', {
        _e: String(e),
      });
    });
    this.audioContext = null;
  }

  private setState(state: DictationSessionState) {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  }
}
