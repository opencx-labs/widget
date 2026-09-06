let lockCount = 0;
let previousOverflow = '';

/** Acquire a shared host-body scroll lock. The returned release function is
 * idempotent, and one widget cannot unlock the page while another still owns
 * a fullscreen panel. */
export function lockHostScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = previousOverflow;
      previousOverflow = '';
    }
  };
}
