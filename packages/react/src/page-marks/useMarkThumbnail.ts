import { useEffect, useState } from 'react';
import { getThumbnail } from './mark-thumbnail';

/**
 * The snapshot taken for a mark, once it lands. Keyed by the mark OBJECT, so
 * the composer pill and the sent bubble — which carries the same reference —
 * resolve the very same capture. Null until (or unless) it settles; every
 * caller has a text form to fall back on.
 */
export function useMarkThumbnail(mark: object | undefined): string | null {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    setThumb(null);
    if (!mark) return;
    let cancelled = false;
    void getThumbnail(mark)?.then((dataUrl) => {
      if (!cancelled && dataUrl) setThumb(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [mark]);

  return thumb;
}
