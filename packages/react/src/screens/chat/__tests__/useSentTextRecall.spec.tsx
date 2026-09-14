import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSentTextRecall, type RecallKeyEvent } from '../useSentTextRecall';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Shell-style ↑/↓ recall of previously sent messages in the composer. The
 * contract, in full: where a walk may START (only from an empty box or with
 * the caret at position 0 — mid-text ↑ stays caret movement), that an EDIT
 * drops you back into a fresh draft, and that the draft the first ↑ stashed
 * comes BACK when you walk ↓ past the newest entry.
 */

/** The textarea the composer would own, with a placeable caret. */
function makeInput(caret: number) {
  return {
    selectionStart: caret,
    selectionEnd: caret,
    offsetWidth: 0,
    classList: { add: vi.fn(), remove: vi.fn() },
    setSelectionRange: vi.fn(),
  };
}

function keyEvent(key: string, repeat = false) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat,
    preventDefault: vi.fn<() => void>(),
  } satisfies RecallKeyEvent;
}

let container: HTMLDivElement;
let root: Root;
let hookValue: ReturnType<typeof useSentTextRecall> | null = null;
let text = '';
let input: ReturnType<typeof makeInput>;
let history: string[] = [];

/**
 * Mirrors the real wiring: the composer owns `inputText` as state and hands it
 * to the hook on every render, so a recall that calls `setInputText` comes
 * back through props exactly as it does in `ChatFooter`.
 */
function Probe({ initialText }: { initialText: string }) {
  const [inputText, setInputText] = React.useState(initialText);
  text = inputText;
  const inputRef = React.useRef(
    input as unknown as HTMLTextAreaElement,
  ) as React.RefObject<HTMLTextAreaElement | null>;
  hookValue = useSentTextRecall({
    inputText,
    setInputText,
    inputRef,
    getSentTextHistory: () => history,
  });
  return null;
}

async function mount({
  entries = [],
  caret = 0,
  initialText = '',
}: { entries?: string[]; caret?: number; initialText?: string } = {}) {
  history = entries;
  text = initialText;
  input = makeInput(caret);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Probe initialText={initialText} />);
  });
  if (!hookValue) throw new Error('hook did not render');
}

/** Press a key, then move the caret where the recalled text leaves it. */
async function press(key: string, repeat = false) {
  const event = keyEvent(key, repeat);
  let consumed = false;
  await act(async () => {
    consumed = hookValue!.onKeyDown(event);
  });
  input.selectionStart = text.length;
  input.selectionEnd = text.length;
  return { consumed, event };
}

describe('useSentTextRecall', () => {
  beforeEach(() => {
    hookValue = null;
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
  });

  it('walks ↑ from the newest entry back to the oldest, then leaves ↑ alone', async () => {
    await mount({ entries: ['first', 'second', 'third'] });

    expect((await press('ArrowUp')).consumed).toBe(true);
    expect(text).toBe('third');
    await press('ArrowUp');
    expect(text).toBe('second');
    await press('ArrowUp');
    expect(text).toBe('first');

    // At the oldest entry the key goes back to meaning "move the caret".
    const { consumed, event } = await press('ArrowUp');
    expect(consumed).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(text).toBe('first');
  });

  it('walking ↓ past the newest entry restores the draft ↑ stashed', async () => {
    await mount({
      entries: ['first', 'second'],
      initialText: 'half-typed thought',
    });

    await press('ArrowUp');
    expect(text).toBe('second');
    await press('ArrowUp');
    expect(text).toBe('first');

    await press('ArrowDown');
    expect(text).toBe('second');
    await press('ArrowDown');
    expect(text).toBe('half-typed thought');
  });

  it('an edit exits recall — ↓ is no longer ours and ↑ restarts from newest', async () => {
    await mount({ entries: ['first', 'second'] });

    await press('ArrowUp');
    await press('ArrowUp');
    expect(text).toBe('first');

    await act(async () => hookValue!.onEdit());
    // Not walking any more, so ↓ belongs to the caret again.
    expect((await press('ArrowDown')).consumed).toBe(false);
    // And ↑ from a non-empty box with the caret at the END is caret movement.
    expect((await press('ArrowUp')).consumed).toBe(false);
    expect(text).toBe('first');
  });

  it('mid-text ↑ is caret movement, not recall', async () => {
    await mount({
      entries: ['first'],
      initialText: 'a draft I am editing',
      caret: 5,
    });

    const { consumed, event } = await press('ArrowUp');
    expect(consumed).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(text).toBe('a draft I am editing');
  });

  it('an empty history has nothing to recall', async () => {
    await mount({ entries: [] });

    expect((await press('ArrowUp')).consumed).toBe(false);
    expect(text).toBe('');
  });

  it('held-key auto-repeat walks entries without replaying the pulse', async () => {
    await mount({ entries: ['first', 'second'] });

    await press('ArrowUp');
    expect(input.classList.add).toHaveBeenCalledTimes(1);

    await press('ArrowUp', true);
    expect(text).toBe('first');
    expect(input.classList.add).toHaveBeenCalledTimes(1);
  });

  it('onSent drops the walk position and the stashed draft', async () => {
    await mount({ entries: ['first', 'second'], initialText: 'stashed' });

    await press('ArrowUp');
    expect(text).toBe('second');

    await act(async () => hookValue!.onSent());

    // No walk in progress, and the stashed draft is gone with it.
    expect((await press('ArrowDown')).consumed).toBe(false);
    expect(text).toBe('second');
  });
});
