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

  it('lets an embedder override a required translation', () => {
    expect(
      getTranslation('send_message', 'fr', {
        fr: { send_message: 'Envoyer maintenant' },
      }),
    ).toBe('Envoyer maintenant');
  });
});
