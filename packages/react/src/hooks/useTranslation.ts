import { useConfig, useDocumentDir } from '@opencx/widget-react-headless';
import { useMemo } from 'react';
import {
  getTranslation,
  isSupportedLanguage,
  type Language,
  type TranslationKeyU,
} from '@opencx/widget-core';

export function useTranslation() {
  const { dir: hostDocumentDir } = useDocumentDir();
  const config = useConfig();

  return useMemo(() => {
    const language: Language = isSupportedLanguage(config.language)
      ? config.language
      : 'en';
    return {
      t: (key: TranslationKeyU) =>
        getTranslation(key, language, config.translationOverrides),
      language: language,
      dir: language === 'ar' || language === 'ur' ? 'rtl' : 'ltr',
      hostDocumentDir,
    };
  }, [config.language, config.translationOverrides, hostDocumentDir]);
}
