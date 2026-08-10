import {
  type DependencyList,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ScrollFollowUtils } from './scroll-follow.utils';

export type StreamFollow = {
  /** Attach to the scroll container. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Attach to the container's `onScroll`. */
  handleScroll: () => void;
  /** True while the user has scrolled away from the bottom — drives the
   * scroll-to-bottom button's visibility. */
  showScrollDown: boolean;
  /** Smooth-scroll to the bottom and re-arm auto-follow (button onClick). */
  scrollToBottom: () => void;
};

/**
 * Companion-parity streaming scroll behavior (dashboard
 * companion/_components/Chat.tsx): the container follows the bottom as content
 * streams in ONLY while the user is pinned near it. The moment they scroll up,
 * `autoFollowRef` releases so new tokens no longer yank the viewport down and
 * the scroll-to-bottom button surfaces instead.
 *
 * `followKey` is the dependency list whose changes represent "new content"
 * (e.g. `[messages, liveItems]`); the follow effect re-runs on each change.
 */
export function useStreamFollow(followKey: DependencyList): StreamFollow {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Intent flag, not a derived position read: a sudden content jump can push
  // the layout past the threshold in a single render even though the user
  // never scrolled. Driven off real scroll events only, it stays armed in
  // that case (companion parity).
  const autoFollowRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    const nearBottom = el ? ScrollFollowUtils.isNearBottom(el) : true;
    autoFollowRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    autoFollowRef.current = true;
    setShowScrollDown(false);
  }, []);

  useEffect(() => {
    if (!autoFollowRef.current) return;
    // Defer a frame so the just-rendered content is measured before we pin.
    const timeout = setTimeout(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, followKey);

  return { containerRef, handleScroll, showScrollDown, scrollToBottom };
}
