import { useState } from 'react';

/**
 * Whether the visitor's primary input can hover. Hover-driven motion (pill
 * label reveal, submenu on hover) is gated off coarse pointers, where a tap
 * fires the hover events first and reads as a phantom wiggle before every
 * open. Detected once: an input modality does not change mid-session.
 */
export function useCanHover(): boolean {
  const [canHover] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  return canHover;
}
