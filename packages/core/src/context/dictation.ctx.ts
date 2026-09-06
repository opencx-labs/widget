import type { ApiCaller } from '../api/api-caller';
import { DictationCommandUtils } from '../dictation/dictation-commands.utils';
import {
  DRIP_INTERVAL_MS,
  DictationDripUtils,
} from '../dictation/dictation-drip.utils';
import { DictationMintCache } from '../dictation/dictation-mint-cache';
import {
  DictationSession,
  type DictationErrorCode,
  type DictationMint,
  type DictationSessionState,
} from '../dictation/dictation-session';
import type { WidgetConfig } from '../types/widget-config';
import { PrimitiveState } from '../utils/PrimitiveState';
import { log } from '../utils/log';

export type DictationStatus = 'idle' | 'connecting' | 'listening';

export type DictationCtxState = {
  status: DictationStatus;
  /** Last failure, cleared on the next start. */
  error: DictationErrorCode | null;
};

/**
 * Where dictated text lands. The widget composer is a plain textarea whose
 * value is React state, so the target is just "what is there now" and "set
 * it". Text is appended after whatever the visitor already typed; a manual
 * edit inside the dictated region ends the session (their edit wins).
 */
export interface DictationTarget {
  getValue: () => string;
  setValue: (value: string) => void;
  /** Fired for the spoken "send message" command, after the text is final. */
  onSend?: (() => void) | undefined;
}

/** A completed command phrase left hanging this long resolves as spoken
 * (the pause IS the command terminator when the model hasn't punctuated). */
const SILENCE_COMMAND_MS = 1_300;

const IDLE: DictationCtxState = { status: 'idle', error: null };

/**
 * Voice dictation for the composer: mic → realtime transcription → the
 * textarea, with the spoken-command grammar ("new line",
 * "scratch that", "send it") and paced word reveal. One session per widget;
 * `start` on a live session restarts it against the new target.
 */
export class DictationCtx {
  public state = new PrimitiveState<DictationCtxState>(IDLE);
  /** 0..1 mic level — read inside a rAF loop, never during render. */
  public readonly levelRef = { current: 0 };

  private readonly api: ApiCaller;
  private readonly config: WidgetConfig;
  private readonly mintCache = new DictationMintCache();

  private session: DictationSession | null = null;
  private target: DictationTarget | null = null;
  private language: string | undefined;
  /** Composer content when dictation started — dictated text follows it. */
  private prefix = '';
  private raw = '';
  private processed = '';
  private displayed = '';
  private dripTimer: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor({ api, config }: { api: ApiCaller; config: WidgetConfig }) {
    this.api = api;
    this.config = config;
  }

  isActive = (): boolean => this.session !== null;

  /** Fire-and-forget token pre-mint (mic hover) so the click starts instantly. */
  prewarm = () => {
    void this.mintToken().catch((e) => {
      this.mintCache.clear();
      log.error('dictation token prewarm failed', {
        _e: e instanceof Error ? e.message : String(e),
      });
    });
  };

  start = (target: DictationTarget) => {
    if (this.session) this.teardown();

    this.target = target;
    this.language = DictationDripUtils.languageHint(
      this.config.language ?? navigator.language,
    );
    this.prefix = target.getValue();
    this.raw = '';
    this.processed = '';
    this.displayed = '';

    const session = new DictationSession({
      mintToken: this.mintToken,
      onLevel: (level) => {
        this.levelRef.current = level;
      },
      onState: (sessionState: DictationSessionState) => {
        if (session !== this.session) return;
        if (sessionState === 'connecting') {
          this.state.set({ status: 'connecting', error: null });
        }
        if (sessionState === 'listening') {
          this.state.set({ status: 'listening', error: null });
        }
        // The session can end itself (max-duration cap): mirror it, or the UI
        // keeps showing a live mic that is actually closed.
        if (sessionState === 'stopped') this.teardown();
      },
      onError: (code) => {
        if (session !== this.session) return;
        // The token may have been the stale part — next attempt mints fresh.
        this.mintCache.clear();
        this.teardown({ error: code, executeFinalCommand: false });
      },
      onDelta: (delta) => {
        if (session !== this.session || !this.target) return;
        if (!this.isConsistent()) {
          // The visitor edited the field mid-dictation — their edit wins.
          this.teardown();
          return;
        }
        this.raw += delta;
        const control = this.ingest();
        if (control === 'stop') {
          this.teardown();
          return;
        }
        if (control === 'send') {
          this.teardown({ send: true });
          return;
        }
        // A completed command phrase waiting for punctuation resolves after a
        // silent pause — the model may never emit the terminator once the
        // user stops talking.
        this.stopSilenceTimer();
        if (
          DictationCommandUtils.pendingTailIsCompletePhrase(
            this.raw,
            this.language,
          )
        ) {
          this.silenceTimer = setTimeout(() => {
            if (session !== this.session) return;
            this.raw = `${this.raw}.`;
            const silenceControl = this.ingest();
            if (silenceControl === 'stop') this.teardown();
            else if (silenceControl === 'send') this.teardown({ send: true });
          }, SILENCE_COMMAND_MS);
        }
      },
    });
    this.session = session;
    this.state.set({ status: 'connecting', error: null });

    this.dripTimer = setInterval(() => {
      if (!this.target) return;
      if (this.processed === this.displayed) return;
      if (!this.isConsistent()) {
        this.teardown();
        return;
      }
      this.applyDisplayed(
        DictationDripUtils.nextDripText({
          displayed: this.displayed,
          processed: this.processed,
        }),
      );
    }, DRIP_INTERVAL_MS);

    void session.start();
  };

  stop = () => {
    if (this.session) this.teardown();
  };

  private mintToken = async (): Promise<DictationMint> =>
    this.mintCache.resolve(() =>
      this.api.createDictationSession({ language: this.language }),
    );

  /** Applied text = prefix + dictated. A mismatch means the visitor edited. */
  private isConsistent(): boolean {
    if (!this.target) return false;
    return this.target.getValue() === this.prefix + this.displayed;
  }

  private applyDisplayed(text: string) {
    if (!this.target) return;
    this.target.setValue(this.prefix + text);
    this.displayed = text;
  }

  /** Process the transcript and apply the outcome. Shared by the delta path,
   * the silence timer, and (with `final`) teardown. Returns the control. */
  private ingest(options?: { final?: boolean }) {
    const result = DictationCommandUtils.process(this.raw, {
      language: this.language,
      final: options?.final,
    });
    this.processed = result.text;
    // Rewrites (scratch-that, retro-capitalization) apply instantly; plain
    // appends flow through the paced drip.
    if (!result.text.startsWith(this.displayed)) {
      this.applyDisplayed(result.text);
    }
    return result.control;
  }

  private stopSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private teardown(options?: {
    send?: boolean;
    error?: DictationErrorCode;
    /** Manual/normal stops execute a trailing spoken command ("…send it").
     * Error teardowns only release the words as text. */
    executeFinalCommand?: boolean;
  }) {
    const endingSession = this.session;
    const endingTarget = this.target;
    if (this.dripTimer) clearInterval(this.dripTimer);
    this.dripTimer = null;
    this.stopSilenceTimer();

    // End-of-stream semantics: stopping IS the pause, so the withheld tail
    // resolves — a completed command phrase fires (unless this is an error
    // teardown), and partial phrases land as literal words instead of
    // vanishing. Consistency-guarded like every other write.
    let send = options?.send ?? false;
    if (endingTarget && this.isConsistent()) {
      const control = this.ingest({ final: true });
      if (options?.executeFinalCommand !== false && control === 'send') {
        send = true;
      }
      if (this.processed !== this.displayed) {
        this.applyDisplayed(this.processed);
      }
    }

    this.session = null;
    this.target = null;
    endingSession?.stop();
    this.levelRef.current = 0;
    this.state.set({ status: 'idle', error: options?.error ?? null });
    if (send) endingTarget?.onSend?.();
  }
}
