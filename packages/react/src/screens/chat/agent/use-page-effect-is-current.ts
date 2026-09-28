import { useCallback, useEffect, useRef } from 'react';

/** A delayed DOM effect must still belong to this mounted, active turn. */
export function usePageEffectIsCurrent(
  effects: readonly { key: string }[],
  isStreaming: boolean,
) {
  const latest = useRef({ effects, isStreaming });
  latest.current = { effects, isStreaming };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(
    (key: string) =>
      mounted.current &&
      latest.current.isStreaming &&
      latest.current.effects.some((effect) => effect.key === key),
    [],
  );
}
