import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanHover } from '../hooks/useCanHover';

/** Hover intent only; Radix owns menu focus, navigation, placement and dismissal. */
export function useChatPicker() {
  const canHover = useCanHover();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [autoFocus, setAutoFocus] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = useCallback(() => clearTimeout(timer.current), []);
  useEffect(() => clear, [clear]);
  const close = useCallback(
    (instant = false) => {
      clear();
      pinned.current = false;
      if (instant) setAnimate(false);
      setOpen(false);
    },
    [clear],
  );
  return {
    anchor,
    open,
    animate,
    autoFocus,
    close,
    toggle(target: HTMLElement, pointer = false) {
      clear();
      if (open && pinned.current) {
        close(!pointer);
        return;
      }
      pinned.current = true;
      setAnchor(target);
      setAnimate(pointer);
      setAutoFocus(true);
      setOpen(true);
    },
    hover(target: HTMLElement) {
      clear();
      if (!canHover || open) return;
      timer.current = setTimeout(() => {
        pinned.current = false;
        setAnchor(target);
        setAnimate(true);
        setAutoFocus(false);
        setOpen(true);
      }, 100);
    },
    enter: clear,
    leave() {
      clear();
      if (!pinned.current) timer.current = setTimeout(() => close(), 200);
    },
  };
}
