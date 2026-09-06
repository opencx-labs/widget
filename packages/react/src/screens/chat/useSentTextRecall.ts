import React, { useRef } from 'react';
import { matchesBinding, WIDGET_KEYBINDINGS } from '../../utils/keybindings';

/** Parts of a keydown this hook reads. */
export type RecallKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat'
> & { preventDefault: () => void };

/**
 * Shell-style ↑/↓ recall of previously sent messages in the composer.
 *
 * The walk position lives in a ref, not state: nothing renders it, and the
 * keydown handler must read the position it just wrote when a held key
 * auto-repeats. `index === null` means "typing a fresh draft" — the first ↑
 * stashes that draft so walking ↓ back past the newest entry restores it.
 *
 * The history itself is NOT owned here. It comes from `MessageCtx`, so it is
 * scoped to one widget instance and one conversation, and survives this
 * component unmounting when the companion morphs between its quick-ask bar
 * and the full chat panel.
 */
export function useSentTextRecall({
  inputText,
  setInputText,
  inputRef,
  getSentTextHistory,
}: {
  inputText: string;
  setInputText: (text: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  getSentTextHistory: () => readonly string[];
}) {
  const indexRef = useRef<number | null>(null);
  const draftRef = useRef('');

  /** Replay the recall settle on the textarea. Imperative classList, not
   * React state: restarting a CSS animation on rapid successive recalls
   * needs remove → forced reflow → re-add, and React leaves classes it
   * didn't render alone, so the two never fight. */
  const playRecallAnimation = () => {
    const el = inputRef.current;
    if (!el) return;
    el.classList.remove('opencx-input-recall');
    void el.offsetWidth;
    el.classList.add('opencx-input-recall');
  };

  const applyRecall = (text: string, { animate = true } = {}) => {
    setInputText(text);
    // Held-key auto-repeat walks entries every ~35ms — replaying the pulse
    // each step reads as flicker, so only a discrete press animates.
    if (animate) playRecallAnimation();
    // Caret lands at the end of the recalled text, after React commits it.
    requestAnimationFrame(() =>
      inputRef.current?.setSelectionRange(text.length, text.length),
    );
  };

  /** Any edit makes the buffer a fresh draft — the next ↑ resumes from the
   * newest entry, like a shell. */
  const onEdit = () => {
    indexRef.current = null;
  };

  /** After a send: recall restarts from the newest entry, no draft stashed. */
  const onSent = () => {
    indexRef.current = null;
    draftRef.current = '';
  };

  /**
   * Handle ↑/↓. Returns true when the event was consumed, so the composer's
   * own keydown chain can stop there.
   */
  const onKeyDown = (event: RecallKeyEvent): boolean => {
    if (matchesBinding(event, WIDGET_KEYBINDINGS['history-prev'])) {
      const history = getSentTextHistory();
      if (history.length === 0) return false;
      const index = indexRef.current;
      if (index === null) {
        // ENTERING a walk is the only moment the caret matters: mid-text ↑ is
        // line navigation in a multi-line box, not history. Once walking, the
        // box holds a recalled entry the user hasn't touched, so ↑/↓ belong to
        // the walk wherever `applyRecall` parked the caret — and any edit
        // hands them straight back (`onEdit`).
        const el = inputRef.current;
        const atStart = el?.selectionStart === 0 && el?.selectionEnd === 0;
        if (!atStart && inputText !== '') return false;
        draftRef.current = inputText;
        indexRef.current = history.length - 1;
      } else {
        if (index === 0) return false; // already at the oldest entry
        indexRef.current = index - 1;
      }
      event.preventDefault();
      applyRecall(history[indexRef.current]!, { animate: !event.repeat });
      return true;
    }

    if (matchesBinding(event, WIDGET_KEYBINDINGS['history-next'])) {
      const index = indexRef.current;
      if (index === null) return false; // not walking history
      event.preventDefault();
      const history = getSentTextHistory();
      if (index >= history.length - 1) {
        // Walked past the newest entry — the stashed draft returns.
        indexRef.current = null;
        applyRecall(draftRef.current, { animate: !event.repeat });
        draftRef.current = '';
      } else {
        indexRef.current = index + 1;
        applyRecall(history[indexRef.current]!, { animate: !event.repeat });
      }
      return true;
    }

    return false;
  };

  return { onKeyDown, onEdit, onSent };
}
