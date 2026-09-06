/**
 * Pure helpers for the dictation hook: paced text reveal ("drip") and the
 * transcription language hint.
 */

/** Cadence of the word-drip renderer (ms per step). */
export const DRIP_INTERVAL_MS = 55;
/** When the backlog grows past this, step faster instead of falling behind. */
const DRIP_BACKLOG_CHARS = 90;

export class DictationDripUtils {
  /**
   * Next paced step toward `processed`: normally one word per tick so text
   * flows evenly instead of landing in bursty chunks; proportionally larger
   * steps when a burst put us far behind. Assumes `processed` extends
   * `displayed` (callers reconcile immediately otherwise).
   */
  static nextDripText({
    displayed,
    processed,
  }: {
    displayed: string;
    processed: string;
  }): string {
    if (processed.length <= displayed.length) return processed;
    const backlog = processed.length - displayed.length;
    if (backlog > DRIP_BACKLOG_CHARS) {
      return processed.slice(0, displayed.length + Math.ceil(backlog / 3));
    }
    // Advance past leading whitespace, then to the end of the next word.
    let i = displayed.length;
    while (i < processed.length && /\s/.test(processed.charAt(i))) i++;
    while (i < processed.length && !/\s/.test(processed.charAt(i))) i++;
    // Unspaced scripts (CJK): cap the step so it still drips.
    if (i - displayed.length > 12) i = displayed.length + 6;
    return processed.slice(0, Math.max(i, displayed.length + 1));
  }

  /** Normalize a BCP-47 browser locale into the hint OpenAI accepts. */
  static languageHint(locale: string | undefined): string | undefined {
    if (!locale) return undefined;
    const lower = locale.toLowerCase();
    // Regional Chinese forms are meaningful to the model; everything else uses
    // the primary subtag ("en-US" → "en").
    if (/^zh-(cn|tw|hk)$/.test(lower)) return lower;
    const primary = lower.split('-')[0];
    return primary && /^[a-z]{2,3}$/.test(primary) ? primary : undefined;
  }
}
