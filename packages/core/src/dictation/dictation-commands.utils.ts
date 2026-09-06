/**
 * Spoken-command grammar for voice dictation.
 *
 * The transcription model already auto-punctuates and capitalizes, so spoken
 * punctuation ("comma", "period") is deliberately NOT converted — saying
 * punctuation aloud is optional and the words stay literal unless they form a
 * standalone command sentence. What IS recognized (Dragon-style) are
 * structural and control commands spoken as their own utterance:
 *
 *   "new line"                  → line break
 *   "new paragraph"             → paragraph break
 *   "bullet point"/"next item"  → start a list item ("- …")
 *   "scratch that"/"delete that"→ remove the previous sentence
 *   "stop dictation"/"stop listening" → end the session
 *   "send message"/"send it"    → end the session and submit (composers)
 *
 * Precision guards:
 * - A phrase only counts as a command when the model rendered it as its own
 *   sentence: preceded by start-of-text or sentence-ending punctuation, and
 *   FOLLOWED by punctuation (the model punctuates a spoken pause — the pause
 *   IS the signal, exactly like Dragon). ". Send it to the team" never fires.
 * - A completed phrase at stream end with no punctuation yet stays PENDING
 *   until the next delta disambiguates it — except in `final` mode (the user
 *   stopped: stopping is the pause, so the phrase resolves as a command).
 * - Command phrases are scoped to English + the session's UI language, so an
 *   Italian speaker's ordinary "Cancella." can't fire scratch-that in an
 *   English session and vice versa.
 */

export type DictationControlAction = 'stop' | 'send';

export interface ProcessedDictation {
  /** Text ready for insertion, with commands applied. */
  text: string;
  /**
   * Trailing raw characters withheld from insertion because they could still
   * grow into a command phrase ("New paragr…"), or ARE a completed phrase
   * awaiting its terminator ("Send it"). Empty in `final` mode.
   */
  pendingTail: string;
  /** Control command encountered (processing stops at that point). */
  control: DictationControlAction | null;
}

export interface ProcessOptions {
  /** ISO language hint (same value sent to the transcription session). */
  language?: string | undefined;
  /**
   * End-of-stream semantics: the user stopped, so a completed command phrase
   * at the very end fires without waiting for punctuation, and no text is
   * withheld — partial phrases are released as literal words.
   */
  final?: boolean;
}

type CommandAction =
  | 'newline'
  | 'newparagraph'
  | 'bullet'
  | 'scratch'
  | 'stop'
  | 'send';

type CommandLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it';

// Latin-script languages with reliable word boundaries. Other languages still
// dictate perfectly — they just use the composer's buttons instead of spoken
// control phrases.
const COMMANDS: Array<{
  action: CommandAction;
  phrases: Record<CommandLanguage, string[]>;
}> = [
  {
    action: 'newparagraph',
    phrases: {
      en: ['new paragraph'],
      es: ['nuevo párrafo', 'nuevo parrafo'],
      fr: ['nouveau paragraphe'],
      de: ['neuer absatz'],
      pt: ['novo parágrafo', 'novo paragrafo'],
      it: ['nuovo paragrafo'],
    },
  },
  {
    action: 'newline',
    phrases: {
      en: ['new line', 'newline'],
      es: ['nueva línea', 'nueva linea'],
      fr: ['nouvelle ligne', 'à la ligne', 'a la ligne'],
      de: ['neue zeile'],
      pt: ['nova linha'],
      it: ['nuova riga'],
    },
  },
  {
    action: 'bullet',
    phrases: {
      en: [
        'bullet point',
        'new bullet',
        'next bullet',
        'bullet list',
        'list item',
        'next item',
        'new item',
      ],
      es: ['nuevo punto', 'nueva viñeta', 'nueva vineta'],
      fr: ['nouvelle puce'],
      de: ['neuer punkt', 'aufzählungspunkt'],
      pt: ['novo item', 'novo marcador'],
      it: ['nuovo punto', 'nuovo elenco'],
    },
  },
  {
    action: 'scratch',
    phrases: {
      en: ['scratch that', 'delete that'],
      es: ['bórralo', 'borra eso'],
      fr: ['efface ça', 'efface ca'],
      de: ['lösch das', 'losch das'],
      pt: ['apaga isso'],
      it: ['cancella'],
    },
  },
  {
    action: 'stop',
    phrases: {
      en: ['stop dictation', 'stop dictating', 'stop listening'],
      es: ['detener dictado'],
      fr: ['arrête la dictée', 'arrete la dictee'],
      de: ['diktat beenden'],
      pt: ['parar ditado'],
      it: ['stop dettatura'],
    },
  },
  {
    action: 'send',
    phrases: {
      en: ['send message', 'send it'],
      es: ['enviar mensaje'],
      fr: ['envoie le message'],
      de: ['nachricht senden'],
      pt: ['enviar mensagem'],
      it: ['invia messaggio'],
    },
  },
];

const SUPPORTED_LANGUAGES: CommandLanguage[] = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
];

function isCommandLanguage(value: string): value is CommandLanguage {
  return (SUPPORTED_LANGUAGES as string[]).includes(value);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Grammar {
  /** Standalone-utterance matcher (terminator REQUIRED). */
  regex: RegExp;
  /** End-of-stream matcher (terminator optional — `$` counts as the pause). */
  finalRegex: RegExp;
  phraseToAction: Map<string, CommandAction>;
  longestPhrase: number;
}

// One alternation per language set, longest phrase first so "new paragraph"
// wins over a shorter overlap. Boundaries:
//   before: start of text (tolerating leading whitespace — realtime deltas
//   are space-prefixed tokens), newline, or sentence-ending punctuation, as a
//   LOOKBEHIND so a command's own terminator stays available as the boundary
//   of a directly following command ("…New line. New paragraph.")
//   after: [.,!?;:] then (lookahead) whitespace or end.
function buildGrammar(languages: CommandLanguage[]): Grammar {
  const entries = COMMANDS.flatMap((c) =>
    languages.flatMap((lang) =>
      c.phrases[lang].map((phrase) => ({ phrase, action: c.action })),
    ),
  );
  const alternation = entries
    .map((e) => escapeRegex(e.phrase))
    .sort((a, b) => b.length - a.length)
    .join('|');
  const before = String.raw`(?<=^\s{0,3}|[.!?\n]\s{0,3})`;
  return {
    regex: new RegExp(
      `${before}(${alternation})` + String.raw`([.,!?;:])(?=\s|$)`,
      'giu',
    ),
    finalRegex: new RegExp(
      `${before}(${alternation})` + String.raw`([.,!?;:]?)(?=\s|$)`,
      'giu',
    ),
    phraseToAction: new Map(
      entries.map((e) => [e.phrase.toLowerCase(), e.action]),
    ),
    longestPhrase: Math.max(...entries.map((e) => e.phrase.length)),
  };
}

const grammarCache = new Map<string, Grammar>();

function grammarFor(language: string | undefined): Grammar {
  const lang =
    language && isCommandLanguage(language) && language !== 'en'
      ? language
      : null;
  const key = lang ?? 'en';
  let grammar = grammarCache.get(key);
  if (!grammar) {
    grammar = buildGrammar(lang ? ['en', lang] : ['en']);
    grammarCache.set(key, grammar);
  }
  return grammar;
}

/** Remove the last sentence (or last line when no terminator) from `text`. */
function deleteLastSentence(text: string): string {
  const trimmed = text.replace(/\s+$/, '');
  if (!trimmed) return '';
  // Ignore a terminator that ends the text itself, then cut after the previous one.
  const body = trimmed.replace(/[.!?]+$/, '');
  let cut = -1;
  for (let i = body.length - 1; i >= 0; i--) {
    const ch = body[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
      cut = i + 1;
      break;
    }
  }
  if (cut === -1) return '';
  return `${body.slice(0, cut)} `.replace(/\n $/, '\n');
}

// After a break (optionally into a bullet), or a bullet at the very start —
// but never the plain first word: dictation may continue an existing sentence.
// Constructor form: the `u`-flag literal trips TS1501 under the app's ts target.
const LOWERCASE_AFTER_BREAK_REGEX = new RegExp(
  String.raw`(^- |\n(?:- )?)(\p{Ll})`,
  'gu',
);

function capitalizeAfterBreaks(text: string): string {
  return text.replace(
    LOWERCASE_AFTER_BREAK_REGEX,
    (_m, brk: string, ch: string) => brk + ch.toUpperCase(),
  );
}

/** Sentence-boundary check for a phrase starting where `before` ends — only
 * the trailing few characters matter (bounded: never scans the transcript). */
function endsAtSentenceBoundary(before: string): boolean {
  // Start of text, tolerating a short space prefix (realtime deltas arrive
  // as space-prefixed tokens).
  if (before.length <= 3 && /^\s*$/.test(before)) return true;
  return /[.!?\n]\s{0,3}$/.test(before.slice(-6));
}

export class DictationCommandUtils {
  /**
   * Process the full raw transcript accumulated so far into insertable text.
   * Pure and deterministic: always called with the entire raw string so the
   * result never depends on delta chunking.
   */
  static process(raw: string, options?: ProcessOptions): ProcessedDictation {
    const grammar = grammarFor(options?.language);
    const pendingTail = options?.final
      ? ''
      : DictationCommandUtils.commandPrefixTail(raw, options?.language);
    const consumable = raw.slice(0, raw.length - pendingTail.length);
    const regex = options?.final ? grammar.finalRegex : grammar.regex;

    let out = '';
    let control: DictationControlAction | null = null;
    let cursor = 0;

    for (const match of Array.from(consumable.matchAll(regex))) {
      const [, phrase = ''] = match;
      const action = grammar.phraseToAction.get(phrase.toLowerCase());
      if (!action) continue;

      // Keep everything before the command (the boundary terminator is a
      // lookbehind, so it's part of the kept text), drop the phrase itself.
      out += consumable.slice(cursor, match.index);
      cursor = match.index + match[0].length;

      if (action === 'newline') out = `${out.replace(/[ \t]+$/, '')}\n`;
      else if (action === 'newparagraph')
        out = `${out.replace(/[ \t]+$/, '')}\n\n`;
      else if (action === 'bullet') {
        const trimmed = out.replace(/[ \t]+$/, '');
        out =
          trimmed === '' || trimmed.endsWith('\n')
            ? `${trimmed}- `
            : `${trimmed}\n- `;
      } else if (action === 'scratch') out = deleteLastSentence(out);
      else {
        control = action === 'send' ? 'send' : 'stop';
        break;
      }
    }
    if (control === null) out += consumable.slice(cursor);

    // Tidy: no leading whitespace, no spaces flanking breaks, single spacing
    // (commands leave doubled gaps behind), max double break, sentences after
    // a break start uppercase.
    const text = capitalizeAfterBreaks(
      out
        .replace(/^\s+/, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/(^|\n)- +/g, '$1- ')
        .replace(/ {2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n'),
    );

    return { text, pendingTail, control };
  }

  /**
   * Longest suffix of `raw` that could still become a command — a proper
   * prefix of a phrase ("New paragr…") OR a COMPLETED phrase with no
   * terminator yet ("…Send it"). Both are withheld from insertion: the next
   * delta either brings punctuation (the phrase was a spoken command) or more
   * words ("Send it to the team" — released as ordinary text). Firing a
   * control command from an intermediate delta would stop or submit
   * mid-sentence.
   */
  static commandPrefixTail(raw: string, language?: string | undefined): string {
    const grammar = grammarFor(language);
    const maxLen = Math.min(raw.length, grammar.longestPhrase + 2);
    for (let len = maxLen; len > 0; len--) {
      const start = raw.length - len;
      // Candidate must begin at a sentence boundary (same guard as matching).
      if (!endsAtSentenceBoundary(raw.slice(0, start))) continue;
      const tail = raw.slice(start).toLowerCase();
      const candidate = tail.replace(/^\s+/, '');
      if (!candidate) continue;
      for (const phrase of Array.from(grammar.phraseToAction.keys())) {
        if (phrase.startsWith(candidate)) {
          // Exclude the leading whitespace — it belongs to the consumable text.
          return raw.slice(start + (tail.length - candidate.length));
        }
      }
    }
    return '';
  }

  /**
   * True when the current pending tail is a COMPLETED phrase (not a partial
   * prefix) — i.e. a silence pause would resolve it into a command. Used by
   * the manager's silence timer.
   */
  static pendingTailIsCompletePhrase(
    raw: string,
    language?: string | undefined,
  ): boolean {
    const tail = DictationCommandUtils.commandPrefixTail(raw, language)
      .trim()
      .toLowerCase();
    if (!tail) return false;
    return grammarFor(language).phraseToAction.has(tail);
  }
}
