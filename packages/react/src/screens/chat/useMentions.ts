import { log, type WidgetMention } from '@opencx/widget-core';
import {
  useComposerDraft,
  useConfig,
  useWidget,
} from '@opencx/widget-react-headless';
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
/** The picker holds this many at most; the host ranks, the widget trims. */
const MAX_MENTION_RESULTS = 40;
/** A group shows this many before its "See N more" row. */
const GROUP_PREVIEW_COUNT = 3;

/** One type's slice of the results, as the picker lists it. */
export type MentionGroup = {
  type: string;
  /** The rows shown: every item once expanded, else the first few. */
  items: WidgetMention[];
  /** How many the "See N more" row stands for; 0 hides the row. */
  hidden: number;
};

/**
 * Results in the order the picker lists them: grouped by type (in first-seen
 * order), each group cut to its preview unless expanded. The flat `visible`
 * list is the same rows top to bottom, so keyboard ↑/↓ and the highlighted
 * index walk exactly what is on screen.
 */
function groupMentions(
  results: readonly WidgetMention[],
  expanded: ReadonlySet<string>,
): { groups: MentionGroup[]; visible: WidgetMention[] } {
  const byType = new Map<string, WidgetMention[]>();
  for (const item of results) {
    const list = byType.get(item.type);
    if (list) list.push(item);
    else byType.set(item.type, [item]);
  }
  const groups: MentionGroup[] = [];
  const visible: WidgetMention[] = [];
  for (const [type, all] of Array.from(byType)) {
    const items = expanded.has(type) ? all : all.slice(0, GROUP_PREVIEW_COUNT);
    groups.push({ type, items, hidden: all.length - items.length });
    visible.push(...items);
  }
  return { groups, visible };
}

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

/** Every `[start, end)` span a picked mention occupies in the text. */
function mentionRanges(
  text: string,
  picked: readonly WidgetMention[],
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const item of picked) {
    const token = mentionText(item);
    let from = 0;
    for (;;) {
      const at = text.indexOf(token, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + token.length });
      from = at + token.length;
    }
  }
  return ranges;
}

/**
 * @-mentions for the composer: watches the text for an `@query` at the caret,
 * asks the host's `config.mentions.search`, and keeps the list of picked
 * items in step with the text — a picked item lives in the text as its
 * `@Title` (highlighted there), and deleting that text drops the item.
 * Nothing happens unless the host configured `mentions` and the org's
 * page-context feature is on.
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

  const { mentions: picked, setMentions: setPicked } = useComposerDraft();
  const [active, setActive] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [results, setResults] = useState<WidgetMention[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [highlighted, setHighlighted] = useState(0);
  const [searching, setSearching] = useState(false);
  const { groups, visible } = useMemo(
    () => groupMentions(results, expanded),
    [expanded, results],
  );

  // Picked items whose `@Title` the visitor deleted from the text are gone.
  useEffect(() => {
    setPicked((current) => {
      const kept = current.filter((item) => text.includes(mentionText(item)));
      return kept.length === current.length ? current : kept;
    });
  }, [text, setPicked]);

  // Re-read the caret on every text change (typing moves it) and on caret
  // moves without typing (arrow keys, clicks), through `onCaretMove`.
  const readActive = useCallback(
    (direction: 'forward' | 'backward' | 'nearest' = 'nearest') => {
      if (!enabled) return;
      const input = inputRef.current;
      let caret = input?.selectionStart ?? text.length;
      // A mention is one unit: a caret that lands inside its `@Title` (a
      // click, an arrow key) is moved to the edge it came from — past the
      // whole token going forward, before it going back, the nearer edge
      // for a click — so it can never be edited from the middle.
      if (input && input.selectionStart === input.selectionEnd) {
        const inside = mentionRanges(text, picked).find(
          (range) => caret > range.start && caret < range.end,
        );
        if (inside) {
          caret =
            direction === 'forward'
              ? inside.end
              : direction === 'backward'
                ? inside.start
                : caret - inside.start < inside.end - caret
                  ? inside.start
                  : inside.end;
          input.setSelectionRange(caret, caret);
        }
      }
      const found = activeMentionQuery(text, caret);
      // The caret sitting right after a picked `@Title` reads as a query for
      // that title; it is not one.
      const next =
        found &&
        picked.some((item) => text.startsWith(mentionText(item), found.start))
          ? null
          : found;
      setActive((current) =>
        current?.start === next?.start && current?.query === next?.query
          ? current
          : next,
      );
    },
    [enabled, inputRef, picked, text],
  );
  useEffect(() => readActive(), [readActive]);

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
            setExpanded(new Set());
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
    [active, close, inputRef, setText, setPicked, text],
  );

  /** Show every item of one type; the highlight stays where it was. */
  const expandGroup = useCallback((type: string) => {
    setExpanded((current) => new Set(current).add(type));
  }, []);

  const isOpen = enabled && active !== null;

  /**
   * Keys the mentions own: Backspace/Delete against a mention's edge removes
   * the whole `@Title`, and while the menu is open ↑/↓/Enter/Tab/Escape
   * drive it. Returns true when it handled the key.
   */
  const onKeyDown = useCallback(
    (event: { key: string; preventDefault: () => void }): boolean => {
      const input = inputRef.current;
      if (
        enabled &&
        input &&
        input.selectionStart === input.selectionEnd &&
        (event.key === 'Backspace' || event.key === 'Delete')
      ) {
        const caret = input.selectionStart;
        const hit = mentionRanges(text, picked).find((range) =>
          event.key === 'Backspace'
            ? range.end === caret
            : range.start === caret,
        );
        if (hit) {
          event.preventDefault();
          // Take the space the pick added after the token with it.
          const end = text[hit.end] === ' ' ? hit.end + 1 : hit.end;
          setText(text.slice(0, hit.start) + text.slice(end));
          requestAnimationFrame(() =>
            input.setSelectionRange(hit.start, hit.start),
          );
          return true;
        }
      }
      if (!isOpen) return false;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return true;
      }
      if (visible.length === 0) return false;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((i) => (i + 1) % visible.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((i) => (i - 1 + visible.length) % visible.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const item = visible[highlighted];
        if (item) pick(item);
        return true;
      }
      return false;
    },
    [
      close,
      enabled,
      highlighted,
      inputRef,
      isOpen,
      pick,
      picked,
      setText,
      text,
      visible,
    ],
  );

  /** Cleared after a send is accepted. */
  const reset = useCallback(() => {
    setPicked([]);
    close();
  }, [close, setPicked]);

  return useMemo(
    () => ({
      picked,
      isOpen,
      /** Index of the `@` the open menu belongs to; the menu sits beside it. */
      anchorIndex: active?.start ?? null,
      /** Show the highlighted item's description beside the menu. */
      preview: mentionsConfig?.preview !== false,
      groups,
      visible,
      expandGroup,
      searching,
      highlighted,
      setHighlighted,
      pick,
      onKeyDown,
      onCaretMove: readActive,
      reset,
    }),
    [
      picked,
      isOpen,
      active,
      mentionsConfig?.preview,
      groups,
      visible,
      expandGroup,
      searching,
      highlighted,
      pick,
      onKeyDown,
      readActive,
      reset,
    ],
  );
}
