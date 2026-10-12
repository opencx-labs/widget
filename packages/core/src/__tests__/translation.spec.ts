import { describe, expect, it } from 'vitest';
import { EnglishLanguage } from '../translation/en';
import {
  getTranslation,
  LANGUAGES,
  type TranslationKeyU,
} from '../translation';

const translationKeys = Object.keys(EnglishLanguage) as TranslationKeyU[];

describe('translations', () => {
  it.each(LANGUAGES)('%s defines every required translation', (language) => {
    for (const key of translationKeys) {
      expect(getTranslation(key, language, undefined), key).not.toBe('');
    }
  });

  it.each(LANGUAGES)('%s preserves interpolation placeholders', (language) => {
    expect(getTranslation('upload_failed', language, undefined)).toContain(
      '{error}',
    );
    expect(getTranslation('json_unsupported', language, undefined)).toContain(
      '{type}',
    );
    expect(getTranslation('json_see_more', language, undefined)).toContain(
      '{count}',
    );
    expect(
      getTranslation('page_mark_shape_aria', language, undefined),
    ).toContain('{shape}');
    expect(getTranslation('page_mark_remove', language, undefined)).toContain(
      '{label}',
    );
  });

  // These keys replaced literals that sat in the components, so every locale
  // had been rendering English. `getTranslation` falls back to English, which
  // means "not empty" would still pass for a locale that was skipped — assert
  // the copy actually moved.
  const previouslyHardcoded = [
    'close_conversation_title',
    'close_conversation_description',
    'close_conversation_cancel',
    'close_conversation_confirm',
    'dialog_close',
    'zoom_in',
    'zoom_out',
    'reset_zoom',
    'support_chat_aria_label',
  ] satisfies TranslationKeyU[];

  // Keys added after a locale shipped get the same English-fallback blind
  // spot, so they join the sweep.
  const mustBeLocalized = [
    ...previouslyHardcoded,
    'csat_feedback_label',
    'csat_submit',
  ] satisfies TranslationKeyU[];

  /**
   * `language.key` pairs whose translation is genuinely the English word, so
   * the sweep below does not report them. Keep this list short and explicit —
   * every entry is a claim that a native speaker would write it this way.
   */
  const sharedWithEnglish = new Set([
    // "No" is the Spanish and Italian word too.
    'es.close_conversation_cancel',
    'it.close_conversation_cancel',
    // "Send" is the Danish and Norwegian imperative too.
    'da.csat_submit',
    'nb.csat_submit',
    'no.csat_submit',
  ]);

  it('recognizes English copy as English', () => {
    // Positive control for the per-language sweep: prove the comparison fires
    // when the copy really is English, so an empty result there means
    // "everything was translated" rather than "nothing was compared".
    expect(mustBeLocalized).toHaveLength(11);
    expect(
      mustBeLocalized.filter(
        (key) => getTranslation(key, 'en', undefined) === EnglishLanguage[key],
      ),
    ).toEqual(mustBeLocalized);
  });

  it.each(LANGUAGES.filter((language) => language !== 'en'))(
    '%s localizes every key that must not fall back to English',
    (language) => {
      const stillEnglish = mustBeLocalized.filter(
        (key) =>
          getTranslation(key, language, undefined) === EnglishLanguage[key] &&
          !sharedWithEnglish.has(`${language}.${key}`),
      );

      expect(stillEnglish).toEqual([]);
    },
  );

  it('lets an embedder override a required translation', () => {
    expect(
      getTranslation('send_message', 'fr', {
        fr: { send_message: 'Envoyer maintenant' },
      }),
    ).toBe('Envoyer maintenant');
  });
});
