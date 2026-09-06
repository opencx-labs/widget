import type { DictationTarget } from '@opencx/widget-core';
import { useCallback, useEffect, useRef } from 'react';
import { useWidget } from '../WidgetProvider';
import { usePrimitiveState } from './usePrimitiveState';

/**
 * Voice dictation for a composer. `enabled` is the server's decision narrowed
 * by the embed (`widgetCtx.features.dictation`); the rest drives the one DictationCtx
 * session. The target callbacks are read through refs so a re-render never
 * restarts a live session.
 */
export function useDictation(target: DictationTarget) {
  const { widgetCtx } = useWidget();
  const ctx = widgetCtx.dictationCtx;
  const state = usePrimitiveState(ctx.state);

  const targetRef = useRef(target);
  targetRef.current = target;

  const start = useCallback(() => {
    ctx.start({
      getValue: () => targetRef.current.getValue(),
      setValue: (value) => targetRef.current.setValue(value),
      onSend: () => targetRef.current.onSend?.(),
    });
  }, [ctx]);

  const toggle = useCallback(() => {
    if (ctx.isActive()) ctx.stop();
    else start();
  }, [ctx, start]);

  // Never leave the microphone open with no visible owner.
  useEffect(() => () => ctx.stop(), [ctx]);

  return {
    enabled: widgetCtx.features.dictation,
    status: state.status,
    error: state.error,
    isActive: state.status !== 'idle',
    /** 0..1 mic level — read inside a rAF loop, not a render. */
    levelRef: ctx.levelRef,
    start,
    stop: ctx.stop,
    toggle,
    prewarm: ctx.prewarm,
  };
}
