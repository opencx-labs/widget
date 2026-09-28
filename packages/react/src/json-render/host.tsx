import {
  getTranslation,
  resolveLanguage,
  type TranslationKeyU,
  type WidgetUiAction,
} from '@opencx/widget-core';
import React, { createContext, useContext, useMemo } from 'react';

/**
 * What the json-render registry needs from whoever mounts it. Inside the
 * widget that is the widget config; on a host page that shows the same
 * transcripts (the OpenCX inbox) it is a few props. One renderer, one
 * catalog, two hosts — the registry never reaches for widget context itself.
 */
export type JsonRenderHost = {
  t: (key: TranslationKeyU, params?: Record<string, string | number>) => string;
  /** Where List links open — the embed's configured anchor target. */
  anchorTarget: string;
  /** Completes card actions the renderer cannot (e.g. test a phone agent). */
  onUiAction?: (action: WidgetUiAction) => void;
};

/** A translator for a host page that only knows the language (no overrides). */
function translatorFor(language: string | undefined): JsonRenderHost['t'] {
  const resolved = resolveLanguage(language);
  return (key, params) => getTranslation(key, resolved, undefined, params);
}

const defaultHost: JsonRenderHost = {
  t: translatorFor('en'),
  anchorTarget: '_blank',
};

const JsonRenderHostContext = createContext<JsonRenderHost>(defaultHost);

export function JsonRenderHostProvider({
  host,
  children,
}: {
  host: JsonRenderHost;
  children: React.ReactNode;
}) {
  return (
    <JsonRenderHostContext.Provider value={host}>
      {children}
    </JsonRenderHostContext.Provider>
  );
}

export function useJsonRenderHost(): JsonRenderHost {
  return useContext(JsonRenderHostContext);
}

/** A host built from plain props — memoized so the tree does not re-render per keystroke. */
export function useHostFromProps({
  language,
  onUiAction,
  anchorTarget = '_blank',
}: {
  language?: string;
  onUiAction?: (action: WidgetUiAction) => void;
  anchorTarget?: string;
}): JsonRenderHost {
  return useMemo(
    () => ({ t: translatorFor(language), anchorTarget, onUiAction }),
    [language, anchorTarget, onUiAction],
  );
}
