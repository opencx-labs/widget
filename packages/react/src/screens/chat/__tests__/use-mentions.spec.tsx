import type { WidgetMention } from '@opencx/widget-core';
import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const items: WidgetMention[] = [
  { type: 'integration', id: 'slack', title: 'Slack' },
  { type: 'workflow', id: 'wf_1', title: 'PostgreSQL Backup' },
];
const search = vi.fn(async (query: string) =>
  items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()),
  ),
);
let pageContext = true;

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ mentions: { search } }),
  useWidget: () => ({ widgetCtx: { features: { pageContext } } }),
}));

import { activeMentionQuery, useMentions } from '../useMentions';

describe('activeMentionQuery', () => {
  it('finds an @ at the start or after whitespace, up to the caret', () => {
    expect(activeMentionQuery('@sl', 3)).toEqual({ start: 0, query: 'sl' });
    expect(activeMentionQuery('hey @Po', 7)).toEqual({ start: 4, query: 'Po' });
    expect(activeMentionQuery('hey @', 5)).toEqual({ start: 4, query: '' });
  });
  it('is closed by a space, a caret elsewhere, or an @ inside a word', () => {
    expect(activeMentionQuery('hey @Po ', 8)).toBeNull();
    expect(activeMentionQuery('hey @Po', 3)).toBeNull();
    expect(activeMentionQuery('mail@x', 6)).toBeNull();
  });
});

type Hook = ReturnType<typeof useMentions>;
let hook: Hook | null = null;
let textarea: HTMLTextAreaElement | null = null;
let setTextOutside: (next: string) => void = () => {};

function Probe({ initial = '' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  setTextOutside = setText;
  hook = useMentions({ text, setText, inputRef: ref });
  return (
    <textarea
      ref={(node) => {
        ref.current = node;
        textarea = node;
      }}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

async function type(next: string) {
  await act(async () => {
    setTextOutside(next);
  });
  // The caret follows the end of what was typed.
  textarea?.setSelectionRange(next.length, next.length);
  await act(async () => hook?.onCaretMove());
}

describe('useMentions', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    pageContext = true;
    search.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('opens on @, searches after the debounce, and picks with Enter', async () => {
    await type('hey @Po');
    expect(hook?.isOpen).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(search).toHaveBeenLastCalledWith('Po');
    expect(hook?.results.map((r) => r.id)).toEqual(['wf_1']);

    const preventDefault = vi.fn();
    await act(async () => {
      hook?.onKeyDown({ key: 'Enter', preventDefault });
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(hook?.isOpen).toBe(false);
    expect(hook?.picked).toEqual([items[1]]);
    expect(textarea?.value).toBe('hey @PostgreSQL Backup ');
  });

  it('drops the chip when its @Title leaves the text, and the text when the chip is removed', async () => {
    await type('@Sl');
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      hook?.pick(items[0]!);
    });
    expect(hook?.picked).toHaveLength(1);

    await type('@Sla ');
    expect(hook?.picked).toHaveLength(0);

    await type('@Sl');
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      hook?.pick(items[0]!);
    });
    await act(async () => {
      hook?.remove(items[0]!);
    });
    expect(hook?.picked).toHaveLength(0);
    expect(textarea?.value).toBe('');
  });

  it('Escape closes the picker and a space closes it too', async () => {
    await type('@Sl');
    expect(hook?.isOpen).toBe(true);
    await act(async () => {
      hook?.onKeyDown({ key: 'Escape', preventDefault: () => {} });
    });
    expect(hook?.isOpen).toBe(false);
    await type('@Sl ');
    expect(hook?.isOpen).toBe(false);
  });

  it('does nothing when the org has no page context', async () => {
    pageContext = false;
    act(() => root.render(<Probe key="off" />));
    await type('@Sl');
    expect(hook?.enabled).toBe(false);
    expect(hook?.isOpen).toBe(false);
  });
});
