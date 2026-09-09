import {
  getTranslation,
  LANGUAGES,
  type TranslationKeyU,
} from '../../translation';
import { EnglishLanguage } from '../../translation/en';

const KEYS = Object.keys(EnglishLanguage) as TranslationKeyU[];

suite(getTranslation.name, () => {
  it('resolves a non-empty string for every key in every language', () => {
    // Positive controls: the sweep below runs over real keys and real locale
    // data, so an empty `missing` means "nothing missing", not "nothing checked".
    expect(KEYS).toContain('attach_files_tooltip');
    expect(LANGUAGES.length).toBeGreaterThan(30);
    expect(getTranslation('close', 'ar', undefined)).toBe('إغلاق');
    expect(getTranslation('close', 'ja', undefined)).toBe('閉じる');

    const missing = LANGUAGES.flatMap((lang) =>
      KEYS.filter((key) => !getTranslation(key, lang, undefined)).map(
        (key) => `${lang}.${key}`,
      ),
    );

    expect(missing).toEqual([]);
  });

  it('keeps the {size} slot in every attach-files tooltip', () => {
    const rendered = LANGUAGES.map((lang) => ({
      lang,
      text: getTranslation('attach_files_tooltip', lang, undefined, {
        size: '25 MB',
      }),
    }));

    // Positive control in the one language we can assert verbatim.
    expect(rendered.find((entry) => entry.lang === 'en')?.text).toBe(
      'Attach images, videos, PDFs, or spreadsheets (max 25 MB)',
    );

    const droppedTheSlot = rendered
      .filter((entry) => !entry.text.includes('25 MB'))
      .map((entry) => entry.lang);

    expect(droppedTheSlot).toEqual([]);
  });

  it('leaves a slot verbatim when no matching var is supplied', () => {
    expect(
      getTranslation('attach_files_tooltip', 'en', undefined, { nope: 'x' }),
    ).toContain('{size}');
  });

  it('interpolates customer-authored overrides too', () => {
    const text = getTranslation(
      'attach_files_tooltip',
      'en',
      { en: { attach_files_tooltip: 'Up to {size} per file' } },
      { size: '25 MB' },
    );

    expect(text).toBe('Up to 25 MB per file');
  });

  it('falls back to the bundled locale when an override omits the key', () => {
    const text = getTranslation('close', 'de', { de: {} }, undefined);

    expect(text).toBe('Schließen');
  });
});
