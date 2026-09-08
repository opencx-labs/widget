import { PrimitiveState, type WidgetMention } from '@opencx/widget-core';
import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';

/** Composer tests replace the provider; lifecycle behavior is tested in headless. */
export function createComposerDraftMock() {
  const state = new PrimitiveState({
    text: '',
    mentions: [] as WidgetMention[],
  });
  function useComposerDraft() {
    const draft = useSyncExternalStore(state.subscribe, state.get, state.get);
    const setText = useCallback((value: SetStateAction<string>) => {
      state.setPartial({
        text: typeof value === 'function' ? value(state.get().text) : value,
      });
    }, []);
    const setMentions = useCallback(
      (value: SetStateAction<WidgetMention[]>) => {
        state.setPartial({
          mentions:
            typeof value === 'function' ? value(state.get().mentions) : value,
        });
      },
      [],
    );
    return {
      ...draft,
      setText,
      setMentions,
      clearSubmitted: () => {
        if (state.get() !== draft) return false;
        state.reset();
        return true;
      },
    };
  }
  return { state, useComposerDraft };
}
