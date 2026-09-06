import { log } from '@opencx/widget-core';
import { useWidget } from '@opencx/widget-react-headless';
import { useCallback, type RefObject } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { usePageMarks } from '../../page-marks/PageMarksProvider';
import { resolvePageMarkTheme } from '../../page-marks/page-mark-theme';
import { usePageMarking } from '../../page-marks/usePageMarking';

/**
 * The composer's side of page marking: the widget-themed marking tool, the
 * attached marks (held by the Widget-scoped `PageMarksProvider`, so they
 * survive the composer unmounting), and the snapshot upload that lets a
 * mark's picture persist exactly like a dropped file.
 */
export function usePageMarkComposer({
  enabled,
  inputRef,
}: {
  enabled: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const { widgetCtx } = useWidget();
  const { theme, cssVars } = useTheme();
  const pageMarkTheme = resolvePageMarkTheme({
    cssVars,
    primaryColor: theme.primaryColor,
    contentZIndex: theme.widgetContentContainer.zIndex,
  });
  const { marks, detach } = usePageMarks();
  const onMarkAttached = useCallback(() => {
    // Bring the visitor back to their question after the mark lands.
    inputRef.current?.focus();
  }, [inputRef]);
  const uploadSnapshot = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const { fileUrl } = await widgetCtx.api.uploadFile({
          file,
          abortSignal: new AbortController().signal,
        });
        return fileUrl ?? null;
      } catch (error) {
        log.warn('page mark snapshot upload failed', error);
        return null;
      }
    },
    [widgetCtx.api],
  );
  const marking = usePageMarking({
    enabled,
    onAttach: onMarkAttached,
    uploadSnapshot,
    accentColor: pageMarkTheme.accent,
    zIndex: pageMarkTheme.inkZIndex,
  });
  return { marks, detach, marking };
}
