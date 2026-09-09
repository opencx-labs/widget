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

  it.each(['ar', 'ja', 'ru'] as const)(
    '%s localizes the labels that used to be hardcoded',
    (language) => {
      // Positive control: this locale really is being read, so a failure below
      // means untranslated copy rather than a broken lookup.
      expect(getTranslation('close_conversation_cancel', 'ar', undefined)).toBe(
        'لا',
      );

      const stillEnglish = previouslyHardcoded.filter(
        (key) =>
          getTranslation(key, language, undefined) === EnglishLanguage[key],
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
