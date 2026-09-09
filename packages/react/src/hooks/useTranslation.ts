import { useConfig, useDocumentDir } from '@opencx/widget-react-headless';
import { useMemo } from 'react';
import {
  getTranslation,
  isSupportedLanguage,
  type Language,
  type TranslationKeyU,
  type TranslationVars,
} from '@opencx/widget-core';

export function useTranslation() {
  const { dir: hostDocumentDir } = useDocumentDir();
  const config = useConfig();

  return useMemo(() => {
    const language: Language = isSupportedLanguage(config.language)
      ? config.language
      : 'en';
    return {
      t: (key: TranslationKeyU, vars?: TranslationVars) =>
        getTranslation(key, language, config.translationOverrides, vars),
      language: language,
      dir: language === 'ar' ? 'rtl' : 'ltr',
      hostDocumentDir,
    };
  }, [config.language, hostDocumentDir]);
}
