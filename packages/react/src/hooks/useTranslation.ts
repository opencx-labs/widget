import { useConfig, useDocumentDir } from '@opencx/widget-react-headless';
import { useMemo } from 'react';
import {
  getTranslation,
  isRtlLanguage,
  resolveLanguage,
  type TranslationKeyU,
} from '@opencx/widget-core';

export type Translate = (
  key: TranslationKeyU,
  params?: Record<string, string | number>,
) => string;

export function useTranslation() {
  const { dir: hostDocumentDir } = useDocumentDir();
  const config = useConfig();

  return useMemo(() => {
    const language = resolveLanguage(config.language);
    const t: Translate = (key, params) =>
      getTranslation(key, language, config.translationOverrides, params);
    return {
      t,
      language,
      dir: isRtlLanguage(language) ? 'rtl' : 'ltr',
      hostDocumentDir,
    };
  }, [config.language, config.translationOverrides, hostDocumentDir]);
}
