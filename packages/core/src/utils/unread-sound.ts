import { log } from './log';

/** Two rising notes, short and quiet. */
const CHIME_NOTES_HZ = [880, 1318.5];
const CHIME_NOTE_GAP_SECONDS = 0.12;
const CHIME_NOTE_SECONDS = 0.35;
const CHIME_PEAK_GAIN = 0.15;

let chimeContext: AudioContext | null = null;
/** The embed's own sound, played once silently to unlock it. */
let customSound: {
  source: string;
  element: HTMLAudioElement;
  unlocked: Promise<void>;
} | null = null;

/**
 * Unlocks the sound while the visitor is clicking or typing. Browsers keep
 * an audio context created outside such a moment muted, and Safari only lets
 * a context or media element that started inside one play later.
 */
export function primeUnreadSound(source: string | undefined): void {
  if (source) {
    unlockCustomSound(source);
    return;
  }
  if (typeof AudioContext === 'undefined') return;
  try {
    chimeContext ??= new AudioContext();
    if (chimeContext.state === 'suspended') void chimeContext.resume();
  } catch (error) {
    log.warn('could not prepare the unread sound', error);
  }
}

/**
 * Plays the unread chime, or the embed's own audio when `source` is a URL.
 * The chime is synthesized, so no file has to load or pass the host page's
 * content security policy.
 */
export function playUnreadSound(source: string | undefined): void {
  if (!hasUserActivation()) return;
  const play = source ? playCustomSound(source) : playChime();
  play.catch((error: unknown) => {
    log.warn('could not play the unread sound', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function unlockCustomSound(source: string): void {
  if (typeof Audio === 'undefined' || customSound?.source === source) return;
  const element = new Audio(source);
  element.muted = true;
  const unlocked = element
    .play()
    .then(() => element.pause())
    .catch((error: unknown) => {
      log.warn('could not prepare the unread sound', {
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      element.muted = false;
      element.currentTime = 0;
    });
  customSound = { source, element, unlocked };
}

async function playCustomSound(source: string): Promise<void> {
  if (customSound?.source !== source) return new Audio(source).play();
  const { element, unlocked } = customSound;
  await unlocked;
  element.currentTime = 0;
  await element.play();
}

async function playChime(): Promise<void> {
  if (typeof AudioContext === 'undefined') return;
  chimeContext ??= new AudioContext();
  const context = chimeContext;
  if (context.state !== 'running') await context.resume();
  const start = context.currentTime;
  CHIME_NOTES_HZ.forEach((frequency, index) => {
    const at = start + index * CHIME_NOTE_GAP_SECONDS;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(CHIME_PEAK_GAIN, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + CHIME_NOTE_SECONDS);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + CHIME_NOTE_SECONDS);
  });
}

/**
 * Before the visitor's first click or keypress the browser refuses sound, and
 * a context resumed then would hold the chime until much later. Browsers
 * without the activation API get a plain attempt.
 */
function hasUserActivation(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.userActivation?.hasBeenActive ?? true;
}
