import { log, type WidgetMention } from '@opencx/widget-core';
import { useConfig, useWidget } from '@opencx/widget-react-headless';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

/** How long the picker waits after a keystroke before asking the host. */
const SEARCH_DEBOUNCE_MS = 150;
/** The picker shows this many at most; the host ranks, the widget trims. */
export const MAX_MENTION_RESULTS = 8;

/**
 * The `@query` the caret is in, if any: an `@` at the start of the text or
 * after whitespace, then anything but whitespace up to the caret. Typing a
 * space or moving the caret out of it closes the picker.
 */
export function activeMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)@(\S*)$/.exec(before);
  if (!match) return null;
  return { start: caret - match[1]!.length - 1, query: match[1]! };
}

/**
 * The widget's own filter for a fixed list: title matches first (prefix
 * before substring), description matches after; an empty query lists all.
 */
export function filterMentions(
  items: readonly WidgetMention[],
  query: string,
): WidgetMention[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  const rank = (item: WidgetMention): number => {
    const title = item.title.toLowerCase();
    if (title.startsWith(needle)) return 0;
    if (title.includes(needle)) return 1;
    if (item.description?.toLowerCase().includes(needle)) return 2;
    return -1;
  };
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

/** The text a picked mention occupies in the composer. */
export const mentionText = (item: WidgetMention): string => `@${item.title}`;

/**
 * @-mentions for the composer: watches the text for an `@query` at the caret,
 * asks the host's `config.mentions.search`, and keeps the list of picked
 * items in step with the text — deleting `@Title` drops its chip, removing
 * the chip deletes its `@Title`. Nothing happens unless the host configured
 * `mentions` and the org's page-context feature is on.
 */
export function useMentions({
  text,
  setText,
  inputRef,
}: {
  text: string;
  setText: (next: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const { mentions: mentionsConfig } = useConfig();
  const { widgetCtx } = useWidget();
  // One search either way: a fixed list is filtered here, a search function
  // is the host's own lookup.
  const items = mentionsConfig?.items;
  const hostSearch = mentionsConfig?.search;
  const search = useMemo(() => {
    if (hostSearch) return hostSearch;
    if (items) return (query: string) => filterMentions(items, query);
    return undefined;
  }, [hostSearch, items]);
  const enabled = Boolean(search) && widgetCtx.features.pageContext;

  const [picked, setPicked] = useState<WidgetMention[]>([]);
  const [active, setActive] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [results, setResults] = useState<WidgetMention[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [searching, setSearching] = useState(false);

  // Picked items whose `@Title` the visitor deleted from the text are gone.
  useEffect(() => {
    setPicked((current) => {
      const kept = current.filter((item) => text.includes(mentionText(item)));
      return kept.length === current.length ? current : kept;
    });
  }, [text]);

  // Re-read the caret on every text change (typing moves it) and on caret
  // moves without typing (arrow keys, clicks), through `onCaretMove`.
  const readActive = useCallback(() => {
    if (!enabled) return;
    const input = inputRef.current;
    const caret = input?.selectionStart ?? text.length;
    const next = activeMentionQuery(text, caret);
    setActive((current) =>
      current?.start === next?.start && current?.query === next?.query
        ? current
        : next,
    );
  }, [enabled, inputRef, text]);
  useEffect(readActive, [readActive]);

  // Debounced host search for the active query; stale answers are dropped.
  const requestRef = useRef(0);
  useEffect(() => {
    if (!active || !search) {
      setResults([]);
      setSearching(false);
      return;
    }
    const request = ++requestRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => search(active.query))
        .then(
          (items) => {
            if (request !== requestRef.current) return;
            setResults(items.slice(0, MAX_MENTION_RESULTS));
            setHighlighted(0);
            setSearching(false);
          },
          (error: unknown) => {
            if (request !== requestRef.current) return;
            log.warn('mentions search failed', error);
            setResults([]);
            setSearching(false);
          },
        );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, search]);

  const close = useCallback(() => {
    requestRef.current += 1;
    setActive(null);
    setResults([]);
    setSearching(false);
  }, []);

  /** Replace the `@query` at the caret with `@Title ` and remember the item. */
  const pick = useCallback(
    (item: WidgetMention) => {
      if (!active) return;
      const end = active.start + 1 + active.query.length;
      const inserted = `${mentionText(item)} `;
      const next = text.slice(0, active.start) + inserted + text.slice(end);
      setText(next);
      setPicked((current) =>
        current.some((p) => p.type === item.type && p.id === item.id)
          ? current
          : [...current, item],
      );
      close();
      const caret = active.start + inserted.length;
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(caret, caret);
      });
    },
    [active, close, inputRef, setText, text],
  );

  /** Drop a chip and the first `@Title` it stands for in the text. */
  const remove = useCallback(
    (item: WidgetMention) => {
      setPicked((current) => current.filter((p) => p !== item));
      const token = mentionText(item);
      const index = text.indexOf(token);
      if (index === -1) return;
      const trailingSpace = text[index + token.length] === ' ' ? 1 : 0;
      setText(
        text.slice(0, index) + text.slice(index + token.length + trailingSpace),
      );
    },
    [setText, text],
  );

  const isOpen = enabled && active !== null;

  /** Keys the picker claims while open; returns true when it handled one. */
  const onKeyDown = useCallback(
    (event: { key: string; preventDefault: () => void }): boolean => {
      if (!isOpen) return false;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return true;
      }
      if (results.length === 0) return false;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((i) => (i + 1) % results.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((i) => (i - 1 + results.length) % results.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const item = results[highlighted];
        if (item) pick(item);
        return true;
      }
      return false;
    },
    [close, highlighted, isOpen, pick, results],
  );

  /** Cleared after a send is accepted. */
  const reset = useCallback(() => {
    setPicked([]);
    close();
  }, [close]);

  return useMemo(
    () => ({
      enabled,
      picked,
      isOpen,
      query: active?.query ?? '',
      results,
      searching,
      highlighted,
      setHighlighted,
      pick,
      remove,
      onKeyDown,
      onCaretMove: readActive,
      reset,
    }),
    [
      enabled,
      picked,
      isOpen,
      active,
      results,
      searching,
      highlighted,
      pick,
      remove,
      onKeyDown,
      readActive,
      reset,
    ],
  );
}
