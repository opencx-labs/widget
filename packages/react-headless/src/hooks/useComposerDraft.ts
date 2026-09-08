import { useCallback, type SetStateAction } from 'react';
import type { WidgetMention } from '@opencx/widget-core';
import { useWidget } from '../WidgetProvider';
import { usePrimitiveState } from './usePrimitiveState';

/** The composer reads and writes its conversation's draft directly. */
export function useComposerDraft() {
  const { widgetCtx } = useWidget();
  const state = widgetCtx.messageCtx.draftState;
  const draft = usePrimitiveState(state);
  const setText = useCallback(
    (value: SetStateAction<string>) => {
      state.setPartial({
        text: typeof value === 'function' ? value(state.get().text) : value,
      });
    },
    [state],
  );
  const setMentions = useCallback(
    (value: SetStateAction<WidgetMention[]>) => {
      state.setPartial({
        mentions:
          typeof value === 'function' ? value(state.get().mentions) : value,
      });
    },
    [state],
  );
  const clearSubmitted = useCallback(() => {
    if (state.get() !== draft) return false;
    state.reset();
    return true;
  }, [state, draft]);
  return { ...draft, setText, setMentions, clearSubmitted };
}
