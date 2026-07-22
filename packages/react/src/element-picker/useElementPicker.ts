import { useCallback, useEffect, useState } from 'react';
import {
  capturePickedElement,
  identifyElementName,
  isWidgetOwnedElement,
  pickableElementAt,
  type PickedElement,
  type PickedElementRect,
} from './element-info';

export type ElementPickerHover = {
  rect: PickedElementRect;
  name: string;
};

const PICKER_STYLE_ATTR = 'data-opencx-picker-style';

/**
 * Pick-an-element mode for the composer: while active, the HOST page gets a
 * crosshair cursor, the hovered element is highlighted (rendered by
 * `ElementPickerOverlay`), and a click captures the element instead of
 * activating it. Esc cancels.
 *
 * All listeners attach to the host `document` in the capture phase — the
 * widget's React code runs in the host realm, so `document` IS the host page.
 * Clicks inside the widget's own iframe never reach these listeners (separate
 * document), and host-portaled widget chrome is skipped via
 * `isWidgetOwnedElement`, so the widget stays usable while picking.
 */
export function useElementPicker({
  onPick,
}: {
  onPick: (picked: PickedElement) => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [hover, setHover] = useState<ElementPickerHover | null>(null);

  useEffect(() => {
    if (!isActive) return;

    // Crosshair everywhere except the widget's own host-DOM nodes. The chat UI
    // iframe keeps its own cursor (separate document).
    const style = document.createElement('style');
    style.setAttribute(PICKER_STYLE_ATTR, '');
    style.textContent = `
      *:not(#opencx-root):not(#opencx-root *):not([data-opencx-root]):not([data-opencx-root] *) {
        cursor: crosshair !important;
      }
    `;
    document.head.appendChild(style);

    const handleMouseMove = (e: MouseEvent) => {
      const el = pickableElementAt(e.clientX, e.clientY);
      if (!el) {
        setHover(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      setHover({
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        name: identifyElementName(el),
      });
    };

    // Swallow presses on the host page so picking a button never activates it.
    // Widget-owned nodes (companion pill etc.) keep working.
    const blockPress = (e: MouseEvent) => {
      if (e.target instanceof Element && isWidgetOwnedElement(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const handleClick = (e: MouseEvent) => {
      if (e.target instanceof Element && isWidgetOwnedElement(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = pickableElementAt(e.clientX, e.clientY);
      if (!el) return;
      onPick(capturePickedElement(el));
      setIsActive(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsActive(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mousedown', blockPress, true);
    document.addEventListener('mouseup', blockPress, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    // A scroll shifts every rect under the cursor — drop the stale highlight
    // until the next mousemove recomputes it.
    const handleScroll = () => setHover(null);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      style.remove();
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mousedown', blockPress, true);
      document.removeEventListener('mouseup', blockPress, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      setHover(null);
    };
  }, [isActive, onPick]);

  const activate = useCallback(() => setIsActive(true), []);
  const cancel = useCallback(() => setIsActive(false), []);
  const toggle = useCallback(() => setIsActive((v) => !v), []);

  return { isActive, hover, activate, cancel, toggle };
}
