import { describe, expect, it } from 'vitest';
import {
  DictationCommandUtils,
  type ProcessOptions,
} from '../../dictation/dictation-commands.utils';

const process = (raw: string, options?: ProcessOptions) =>
  DictationCommandUtils.process(raw, options);

describe('DictationCommandUtils.process — plain transcription', () => {
  it('passes ordinary text through untouched', () => {
    const r = process('Hello team, this is a test of live dictation.');
    expect(r.text).toBe('Hello team, this is a test of live dictation.');
    expect(r.control).toBeNull();
  });

  it('handles empty and whitespace-only input', () => {
    expect(process('').text).toBe('');
    expect(process('   ').text).toBe('');
  });

  it('is deterministic on the full string regardless of how deltas chunked it', () => {
    const full = 'Hello team. New paragraph. Thanks so much for your patience.';
    const finalResult = process(full);
    // Processing every prefix never throws, and the final result is stable.
    for (let i = 1; i <= full.length; i++) {
      expect(() => process(full.slice(0, i))).not.toThrow();
    }
    expect(finalResult.text).toBe(
      'Hello team.\n\nThanks so much for your patience.',
    );
  });
});

describe('DictationCommandUtils.process — structural commands', () => {
  it('converts a standalone "new paragraph" sentence into a paragraph break', () => {
    const r = process('Hello team. New paragraph. Thanks for your patience.');
    expect(r.text).toBe('Hello team.\n\nThanks for your patience.');
  });

  it('converts "new line" into a line break', () => {
    const r = process('First point. New line. Second point.');
    expect(r.text).toBe('First point.\nSecond point.');
  });

  it('capitalizes the word after a break', () => {
    const r = process('Intro. New line. lowercase start.');
    expect(r.text).toBe('Intro.\nLowercase start.');
  });

  it('handles consecutive commands ("new line" then "new paragraph")', () => {
    const r = process('Hi. New line. New paragraph. Bye.');
    // Consecutive breaks collapse to at most a double break.
    expect(r.text).toBe('Hi.\n\nBye.');
  });

  it('supports commands in Spanish, French, German, Portuguese, Italian (with the language hint)', () => {
    expect(
      process('Hola. Nuevo párrafo. Adiós.', { language: 'es' }).text,
    ).toBe('Hola.\n\nAdiós.');
    expect(
      process('Bonjour. Nouvelle ligne. Salut.', { language: 'fr' }).text,
    ).toBe('Bonjour.\nSalut.');
    expect(
      process('Hallo. Neuer Absatz. Tschüss.', { language: 'de' }).text,
    ).toBe('Hallo.\n\nTschüss.');
    expect(process('Olá. Nova linha. Tchau.', { language: 'pt' }).text).toBe(
      'Olá.\nTchau.',
    );
    expect(
      process('Ciao. Nuova riga. Arrivederci.', { language: 'it' }).text,
    ).toBe('Ciao.\nArrivederci.');
  });

  it('foreign-language phrases NEVER fire without their language hint (data-loss guard)', () => {
    // Italian "Cancella." as ordinary dictated content in an English session
    // must stay literal — firing scratch-that would delete the previous
    // sentence.
    const it_ = process('Ho finito il testo. Cancella. Poi continua.');
    expect(it_.text).toBe('Ho finito il testo. Cancella. Poi continua.');
    const de = process('Auf den Knopf klicken. Nachricht senden. Fertig.');
    expect(de.control).toBeNull();
    expect(de.text).toBe('Auf den Knopf klicken. Nachricht senden. Fertig.');
    // English commands stay active in every session.
    expect(process('Uno. New line. Due.', { language: 'it' }).text).toBe(
      'Uno.\nDue.',
    );
  });

  it('recognizes a command at the very start of a space-prefixed transcript', () => {
    // Realtime deltas arrive as space-prefixed tokens — the session's first
    // spoken command must still convert.
    const r = process(' New line. Hello there.');
    expect(r.text).toBe('Hello there.');
  });

  it('is case-insensitive', () => {
    expect(process('One. NEW LINE. Two.').text).toBe('One.\nTwo.');
  });
});

describe('DictationCommandUtils.process — bullets', () => {
  it('converts "bullet point" into a "- " list line', () => {
    const r = process(
      'Here is the plan. Bullet point. Ship the fix. Bullet point. Tell the user.',
    );
    expect(r.text).toBe('Here is the plan.\n- Ship the fix.\n- Tell the user.');
  });

  it('starts a bullet at the very beginning of dictation', () => {
    const r = process('Bullet point. first thing.');
    expect(r.text).toBe('- First thing.');
  });

  it('supports "next item" and "list item" synonyms', () => {
    const r = process('Todo. List item. One. Next item. Two.');
    expect(r.text).toBe('Todo.\n- One.\n- Two.');
  });
});

describe('DictationCommandUtils.process — command precision (no false positives)', () => {
  it('does NOT trigger mid-sentence ("a new line of products")', () => {
    const raw = 'We just launched a new line of products.';
    expect(process(raw).text).toBe(raw);
  });

  it('does NOT trigger without a sentence boundary before the phrase', () => {
    const raw = 'The bullet point here is important.';
    expect(process(raw).text).toBe(raw);
  });

  it('does NOT treat "the next item on the agenda" as a command', () => {
    const raw = 'Let us discuss the next item on the agenda.';
    expect(process(raw).text).toBe(raw);
  });
});

describe('DictationCommandUtils.process — scratch that', () => {
  it('removes the previous sentence', () => {
    const r = process(
      'Keep this. Remove this mistake. Scratch that. And continue.',
    );
    expect(r.text).toBe('Keep this. And continue.');
  });

  it('removes everything when only one sentence exists', () => {
    const r = process('Only sentence here. Scratch that.');
    expect(r.text).toBe('');
  });

  it('supports "delete that"', () => {
    const r = process('Good part. Bad part. Delete that.');
    expect(r.text).toBe('Good part. ');
  });
});

describe('DictationCommandUtils.process — final (end-of-stream) semantics', () => {
  it('a completed command at the end fires without punctuation in final mode', () => {
    const r = process('Please refund the customer. Send it', { final: true });
    expect(r.control).toBe('send');
    expect(r.text).toBe('Please refund the customer. ');
    expect(r.pendingTail).toBe('');
  });

  it('a partial phrase at the end is released as literal words in final mode', () => {
    const r = process('Hello there. New paragr', { final: true });
    expect(r.control).toBeNull();
    expect(r.text).toBe('Hello there. New paragr');
  });

  it('a structural command at the end applies in final mode', () => {
    const r = process('First point. New line', { final: true });
    expect(r.text).toBe('First point.\n');
  });

  it('ordinary text is unaffected by final mode', () => {
    const r = process('Just some words', { final: true });
    expect(r.text).toBe('Just some words');
  });
});

describe('DictationCommandUtils.pendingTailIsCompletePhrase', () => {
  it('true for a completed phrase awaiting its terminator', () => {
    expect(
      DictationCommandUtils.pendingTailIsCompletePhrase('Sounds good. Send it'),
    ).toBe(true);
    expect(
      DictationCommandUtils.pendingTailIsCompletePhrase('Done. Stop dictation'),
    ).toBe(true);
  });

  it('false for a partial prefix or plain text', () => {
    expect(
      DictationCommandUtils.pendingTailIsCompletePhrase('Hello. New paragr'),
    ).toBe(false);
    expect(
      DictationCommandUtils.pendingTailIsCompletePhrase('Just words here'),
    ).toBe(false);
    expect(DictationCommandUtils.pendingTailIsCompletePhrase('')).toBe(false);
  });

  it('respects the language scope', () => {
    expect(
      DictationCommandUtils.pendingTailIsCompletePhrase('Ecco. Cancella'),
    ).toBe(false);
    expect(
      DictationCommandUtils.pendingTailIsCompletePhrase('Ecco. Cancella', 'it'),
    ).toBe(true);
  });
});

describe('DictationCommandUtils.process — no premature firing from mid-stream deltas', () => {
  it('a completed control phrase at stream end (no punctuation yet) stays pending', () => {
    // "…Send it" could continue as "Send it to the team" — firing here would
    // submit an incomplete message.
    const r = process('Please refund the customer. Send it');
    expect(r.control).toBeNull();
    expect(r.pendingTail).toBe('Send it');
    expect(r.text).toBe('Please refund the customer. ');
  });

  it('the pending phrase fires once its punctuation arrives', () => {
    const r = process('Please refund the customer. Send it.');
    expect(r.control).toBe('send');
  });

  it('the pending phrase releases as ordinary text when more words follow', () => {
    const r = process(
      'Please refund the customer. Send it to the accounting team.',
    );
    expect(r.control).toBeNull();
    expect(r.text).toBe(
      'Please refund the customer. Send it to the accounting team.',
    );
  });

  it('"stop dictation" mid-stream is also held', () => {
    const r = process('Almost done. Stop dictation');
    expect(r.control).toBeNull();
    expect(r.pendingTail).toBe('Stop dictation');
  });

  it('a sentence-initial phrase followed by flowing text never fires', () => {
    // Terminator required directly after the phrase: a space is not enough.
    const r = process('Hello. New line breaks are all the rage these days.');
    expect(r.text).toBe('Hello. New line breaks are all the rage these days.');
  });
});

describe('DictationCommandUtils.process — control commands', () => {
  it('"stop dictation" ends processing and signals stop', () => {
    const r = process(
      'This is my message. Stop dictation. anything after is ignored',
    );
    expect(r.control).toBe('stop');
    expect(r.text).toBe('This is my message. ');
  });

  it('"stop listening" also stops', () => {
    expect(process('Done now. Stop listening.').control).toBe('stop');
  });

  it('"send message" signals send with the text finalized', () => {
    const r = process('Please refund the customer. Send message.');
    expect(r.control).toBe('send');
    expect(r.text).toBe('Please refund the customer. ');
  });

  it('"send it" signals send', () => {
    expect(process('Quick reply. Send it.').control).toBe('send');
  });
});

describe('DictationCommandUtils.commandPrefixTail — streaming holdback', () => {
  it('withholds a partial command phrase at a sentence boundary', () => {
    const r = process('Hello there. New paragr');
    expect(r.pendingTail).toBe('New paragr');
    expect(r.text).toBe('Hello there. ');
  });

  it('does not withhold mid-sentence prefixes', () => {
    const r = process('I bought a new');
    expect(r.pendingTail).toBe('');
    expect(r.text).toBe('I bought a new');
  });

  it('converts a completed phrase, and withholds a following ambiguous word', () => {
    // "Next" could still grow into "Next item" — it stays pending until the
    // following delta disambiguates it.
    const r = process('Hello there. New paragraph. Next');
    expect(r.pendingTail).toBe('Next');
    expect(r.text).toBe('Hello there.\n\n');
    // A non-command continuation releases it.
    const resolved = process('Hello there. New paragraph. Next week works.');
    expect(resolved.pendingTail).toBe('');
    expect(resolved.text).toBe('Hello there.\n\nNext week works.');
  });

  it('resolves the holdback when the words turn out to be ordinary text', () => {
    const r = process('Hello there. New products are great.');
    expect(r.pendingTail).toBe('');
    expect(r.text).toBe('Hello there. New products are great.');
  });
});

describe('DictationCommandUtils.process — tidy-up invariants', () => {
  it('never emits three or more consecutive newlines', () => {
    const r = process('A. New paragraph. New paragraph. New paragraph. B.');
    expect(r.text).not.toMatch(/\n{3,}/);
    expect(r.text).toBe('A.\n\nB.');
  });

  it('strips leading whitespace/breaks', () => {
    const r = process('New paragraph. Actual content.');
    expect(r.text).toBe('Actual content.');
  });

  it('never leaves spaces flanking a break', () => {
    const r = process('One. New line. Two. New line. Three.');
    expect(r.text).not.toMatch(/ \n|\n /);
  });
});
